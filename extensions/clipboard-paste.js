/**
 * Clipboard paste for pi on Windows.
 *
 * Alt+V inserts the file paths of everything copied in Explorer, separated by
 * spaces. If the clipboard holds an image (screenshot, snip, copied bitmap)
 * instead of files, the image is written to a temp PNG and that path is
 * inserted. Plain text is inserted as-is.
 *
 * Ctrl+V is registered too, but Windows terminals (conhost, Windows Terminal)
 * reserve Ctrl+V for their own paste action, which only inserts text or file
 * paths. Use Alt+V for clipboard images.
 *
 * Native clipboard reads cover images and text. The file drop list needs the
 * Windows clipboard API, so a tiny persistent helper process (bin/clipget.exe)
 * reads it in ~0.5ms. If the helper is missing, PowerShell is used as a slower
 * fallback.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { convertToPng } from "@earendil-works/pi-coding-agent";
import { getNativeClipboard } from "@earendil-works/pi-tui";

const WIN32 = process.platform === "win32";
const END_MARKER = "__PI_CLIPGET_END__\n";
const ERROR_MARKER = "__PI_CLIPGET_ERROR__";
const REQUEST_TIMEOUT_MS = 1000;

// ---------------------------------------------------------------------------
// Tiny helper process: reads the CF_HDROP file drop list in ~0.5ms
// ---------------------------------------------------------------------------

let helper = null;
let helperChain = Promise.resolve();

function helperPath() {
	try {
		return join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "clipget.exe");
	} catch {
		return null;
	}
}

function startHelper(exePath) {
	if (helper && !helper.dead) return helper;

	const child = spawn(exePath, [], { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
	const state = { child, buffer: "", pending: null, dead: false };

	child.stdout.on("data", (chunk) => {
		state.buffer = (state.buffer + chunk.toString("utf8")).replace(/\r\n/g, "\n");
		let index;
		while ((index = state.buffer.indexOf(END_MARKER)) !== -1) {
			const block = state.buffer.slice(0, index);
			state.buffer = state.buffer.slice(index + END_MARKER.length);
			const lines = block.split("\n").filter(Boolean);
			const failed = lines.includes(ERROR_MARKER);
			const paths = lines.filter((line) => line !== ERROR_MARKER);
			if (state.pending) {
				const resolve = state.pending;
				state.pending = null;
				resolve(failed ? null : paths);
			}
		}
	});

	const die = () => {
		state.dead = true;
		if (state.pending) {
			const resolve = state.pending;
			state.pending = null;
			resolve(null);
		}
	};
	child.on("exit", die);
	child.on("error", die);

	helper = state;
	return state;
}

function requestHelper() {
	const run = () =>
		new Promise((resolve) => {
			const state = helper;
			if (!state || state.dead) {
				resolve(undefined);
				return;
			}
			const timer = setTimeout(() => {
				if (!state.pending) return;
				state.pending = null;
				state.dead = true;
				try {
					state.child.kill();
				} catch {}
				if (helper === state) helper = null;
				resolve(undefined);
			}, REQUEST_TIMEOUT_MS);
			state.pending = (paths) => {
				clearTimeout(timer);
				resolve(paths);
			};
			try {
				state.child.stdin.write("x\n");
			} catch {
				clearTimeout(timer);
				state.pending = null;
				resolve(undefined);
			}
		});

	const result = helperChain.then(run, run);
	helperChain = result.then(
		() => undefined,
		() => undefined,
	);
	return result;
}

/** `undefined` = helper unavailable, `null` = error, `[]` = no files, else paths. */
async function readFilePathsFast() {
	if (!WIN32) return undefined;
	const exePath = helperPath();
	if (!exePath || !existsSync(exePath)) return undefined;
	if (!helper || helper.dead) startHelper(exePath);
	return requestHelper();
}

// ---------------------------------------------------------------------------
// Slower fallback: PowerShell one-shot
// ---------------------------------------------------------------------------

async function readFilePathsViaPowerShell() {
	const script =
		"[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-Clipboard -Format FileDropList -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }";
	const stdout = await new Promise((resolve) => {
		const child = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
			windowsHide: true,
		});
		const chunks = [];
		child.stdout.on("data", (chunk) => chunks.push(chunk));
		child.on("error", () => resolve(null));
		child.on("close", (code) => resolve(code === 0 ? Buffer.concat(chunks).toString("utf8") : null));
	}).catch(() => null);
	if (!stdout) return null;
	const paths = stdout.split(/\r?\n/).filter(Boolean);
	return paths.length > 0 ? paths : null;
}

/** Read clipboard file paths, or null when the clipboard has no file drop list. */
async function readFilePaths() {
	try {
		const nativePaths = await getNativeClipboard()?.getFilePaths?.();
		if (nativePaths?.length) return nativePaths;
	} catch {}

	if (WIN32) {
		const fast = await readFilePathsFast();
		if (fast !== undefined) return fast && fast.length ? fast : null;
		return await readFilePathsViaPowerShell();
	}

	return null;
}

// ---------------------------------------------------------------------------
// Paste handler
// ---------------------------------------------------------------------------

async function pasteHandler(ctx) {
	const clipboard = getNativeClipboard();

	// Copied image (screenshot, snip, bitmap): write a temp PNG and paste its path.
	// getImage() resolves to raw bytes (a Buffer on Windows) or { data } / { bytes }.
	try {
		const raw = await clipboard?.getImage?.();
		const data = clipboardImageBytes(raw);
		if (data?.length) {
			const isPng =
				data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47;
			const png = await convertToPng(
				data.toString("base64"),
				isPng ? "image/png" : "image/bmp",
			);
			if (png?.data) {
				const filePath = join(tmpdir(), `pi-clipboard-${crypto.randomUUID()}.png`);
				await writeFile(filePath, Buffer.from(png.data, "base64"));
				const info = await stat(filePath);
				if (info.size > 0) {
					insert(ctx, filePath);
					return;
				}
			}
		}
	} catch {}

	// Copied files: paste their paths separated by spaces.
	const paths = await readFilePaths();
	if (paths) {
		const text = paths.join(" ");
		insert(ctx, isBashMode(ctx) ? quoteForBash(text) : text);
		return;
	}

	// Plain text fallback.
	try {
		const text = await clipboard?.getText?.();
		if (typeof text === "string" && text.length > 0) {
			insert(ctx, text);
			return;
		}
	} catch {}
}

/** Accept the shapes @earendil-works/pi-tui's getImage() may resolve to. */
function clipboardImageBytes(image) {
	if (!image) return null;
	const data = image.data ?? image.bytes ?? image;
	if (typeof data === "string") return Buffer.from(data, "base64");
	if (typeof data?.length === "number" && data.length > 0) return Buffer.from(data);
	return null;
}

function insert(ctx, text) {
	const ui = ctx?.ui;
	if (!ui) return;
	if (typeof ui.pasteToEditor === "function") {
		ui.pasteToEditor(text);
	} else if (typeof ui.setEditorText === "function") {
		ui.setEditorText(`${ui.getEditorText?.() ?? ""}${text}`);
	}
	// The shortcut handler runs outside pi's input loop, so nothing repaints the
	// editor until the next keypress. Clearing an unused status entry is the only
	// public extension API that forces a render.
	try {
		ui.setStatus?.("__pi_clipboard_paste", undefined);
	} catch {}
}

function isBashMode(ctx) {
	try {
		return (ctx?.ui?.getEditorText?.() ?? "").trimStart().startsWith("!");
	} catch {
		return false;
	}
}

function quoteForBash(text) {
	return `'${text.replace(/'/g, `'\\''`)}'`;
}

export default function clipboardPasteExtension(pi) {
	// Ctrl+V (and Alt+V) normally paste an image; replace them with
	// files/image/text paste. app.clipboard.pasteImage is not reserved, so this
	// is allowed and only produces a startup diagnostic.
	const options = {
		description: "Paste copied file paths, clipboard images, or text",
		handler: (ctx) => pasteHandler(ctx),
	};
	pi.registerShortcut("ctrl+v", options);
	pi.registerShortcut("alt+v", options);

	if (WIN32) {
		// Warm the helper up at startup so the first paste is already fast.
		const exePath = helperPath();
		if (exePath && existsSync(exePath)) {
			startHelper(exePath);
			void requestHelper();
		}

		pi.events.on("session_shutdown", () => {
			if (helper?.child) {
				try {
					helper.child.kill();
				} catch {}
			}
			helper = null;
		});
	}
}