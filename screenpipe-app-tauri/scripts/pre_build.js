import { $ } from 'bun'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

const isDevMode = process.env.SCREENPIPE_APP_DEV === 'true' || false;

const originalCWD = process.cwd()
// Change CWD to src-tauri
process.chdir(path.join(__dirname, '../src-tauri'))
const platform = {
	win32: 'windows',
	darwin: 'macos',
	linux: 'linux',
}[os.platform()]
const cwd = process.cwd()
console.log('cwd', cwd)
function hasFeature(name) {
	return process.argv.includes(`--${name}`) || process.argv.includes(name)
}

const config = {
	ffmpegRealname: 'ffmpeg',
	openblasRealname: 'openblas',
	clblastRealname: 'clblast',
	windows: {
		ffmpegName: 'ffmpeg-7.0-windows-desktop-vs2022-default',
		ffmpegUrl: 'https://unlimited.dl.sourceforge.net/project/avbuild/windows-desktop/ffmpeg-7.0-windows-desktop-vs2022-default.7z?viasf=1',

		// TODO unused dead code?
		openBlasName: 'OpenBLAS-0.3.26-x64',
		openBlasUrl: 'https://github.com/OpenMathLib/OpenBLAS/releases/download/v0.3.26/OpenBLAS-0.3.26-x64.zip',

		clblastName: 'CLBlast-1.6.2-windows-x64',
		clblastUrl: 'https://github.com/CNugteren/CLBlast/releases/download/1.6.2/CLBlast-1.6.2-windows-x64.zip',

		vcpkgPackages: ['opencl', 'onnxruntime-gpu'],
	},
	linux: {
		aptPackages: [
			'tesseract-ocr',
			'libtesseract-dev',
			'ffmpeg',
			'pkg-config',
			'build-essential',
			'libglib2.0-dev',
			'libgtk-3-dev',
			'libwebkit2gtk-4.1-dev',
			'clang',
			'cmake', // Tauri
			'libavutil-dev',
			'libavformat-dev',
			'libavfilter-dev',
			'libavdevice-dev', // FFMPEG
			'libasound2-dev', // cpal
			'libxdo-dev',
		],
	},
	macos: {
		ffmpegName: 'ffmpeg-7.0-macOS-default',
		ffmpegUrl: 'https://master.dl.sourceforge.net/project/avbuild/macOS/ffmpeg-7.0-macOS-default.tar.xz?viasf=1',
	},
}

async function findWget() {
	const possiblePaths = [
		'C:\\ProgramData\\chocolatey\\bin\\wget.exe',
		'C:\\Program Files\\Git\\mingw64\\bin\\wget.exe',
		'C:\\msys64\\usr\\bin\\wget.exe',
		'C:\\Windows\\System32\\wget.exe',
		'wget' // This will work if wget is in PATH
	];

	for (const wgetPath of possiblePaths) {
		try {
			await $`${wgetPath} --version`.quiet();
			console.log(`wget found at: ${wgetPath}`);
			return wgetPath;
		} catch (error) {
			// wget not found at this path, continue searching
		}
	}

	console.error('wget not found. Please install wget and make sure it\'s in your PATH.');
	process.exit(1);
}

// Export for Github actions
const exports = {
	ffmpeg: path.join(cwd, config.ffmpegRealname),
	openBlas: path.join(cwd, config.openblasRealname),
	clblast: path.join(cwd, config.clblastRealname, 'lib/cmake/CLBlast'),
	libClang: 'C:\\Program Files\\LLVM\\bin',
	cmake: 'C:\\Program Files\\CMake\\bin',
}

// Add this function to check if Deno is installed
async function isDenoInstalled() { // assuming it's installed in PATH
	try {
		await $`deno --version`.quiet();
		return true;
	} catch (error) {
		return false;
	}
}

// Add this function to install Deno
async function installDeno() {
	if (await isDenoInstalled()) {
		console.log('deno is already installed.');
		return;
	}

	console.log('installing deno...');

	if (platform === 'windows') {
		console.log('attempting to install deno using chocolatey...');
		try {
			await $`choco upgrade deno -y`;
			console.log('deno installed/upgraded successfully using chocolatey.');
		} catch (chocoError) {
			console.error('failed to install/upgrade deno using chocolatey:', chocoError);
			console.error('please install deno manually.');
		}
	} else {
		// for macos and linux
		await $`curl -fsSL https://deno.land/install.sh | sh`;
	}

	console.log('deno installation attempt completed.');
}

// Add this function to copy the Deno binary
async function copyDenoBinary() {
	console.log('checking deno binary for tauri...');

	let denoSrc, denoDest1, denoDest2;
	if (platform === 'windows') {
		// Check both potential installation locations
		const chocoPathTools = 'C:\\ProgramData\\chocolatey\\lib\\deno\\tools\\deno.exe';
		const chocoPathDirect = 'C:\\ProgramData\\chocolatey\\lib\\deno\\deno.exe';

		if (await fs.exists(chocoPathTools)) {
			denoSrc = chocoPathTools;
		} else if (await fs.exists(chocoPathDirect)) {
			denoSrc = chocoPathDirect;
		} else {
			console.error('deno binary not found in expected locations');
			return;
		}
		denoDest1 = path.join(cwd, 'deno-x86_64-pc-windows-msvc.exe');
	} else if (platform === 'macos') {
		denoSrc = path.join(os.homedir(), '.deno', 'bin', 'deno');
		denoDest1 = path.join(cwd, 'deno-aarch64-apple-darwin');
		denoDest2 = path.join(cwd, 'deno-x86_64-apple-darwin');
	} else if (platform === 'linux') {
		denoSrc = path.join(os.homedir(), '.deno', 'bin', 'deno');
		denoDest1 = path.join(cwd, 'deno-x86_64-unknown-linux-gnu');
	} else {
		console.error('unsupported platform for deno binary copy');
		return;
	}

	if (await fs.exists(denoDest1)) {
		console.log('deno binary already exists for tauri.');
		return;
	}

	try {
		// Check if the source file exists
		await fs.access(denoSrc);

		// If it exists, proceed with copying
		await copyFile(denoSrc, denoDest1);
		console.log(`deno binary copied successfully to ${denoDest1}`);

		if (platform === 'macos') {
			await copyFile(denoSrc, denoDest2);
			console.log(`deno binary also copied to ${denoDest2}`);
		}
	} catch (error) {
		if (error.code === 'ENOENT') {
			console.error(`deno binary not found at expected location: ${denoSrc}`);
			console.log('attempting to find deno in PATH...');

			try {
				const { stdout } = await $`where deno`.quiet();
				const denoPath = stdout.trim();
				console.log(`found deno at: ${denoPath}`);
				await fs.copyFile(denoPath, denoDest1);
				await fs.chmod(denoDest1, 0o755);
				console.log(`deno binary copied successfully from PATH to ${denoDest1}`);

				if (platform === 'macos') {
					await fs.copyFile(denoPath, denoDest2);
					await fs.chmod(denoDest2, 0o755);
					console.log(`deno binary also copied to ${denoDest2}`);
				}
			} catch (pathError) {
				console.error('failed to find deno in PATH:', pathError);
				console.log('please ensure deno is installed and accessible in your PATH');
			}
		} else if (error.code === 'EPERM') {
			console.error(`permission denied when copying deno binary. trying elevated copy...`);
			await elevatedCopy(denoSrc, denoDest1);
			console.log(`deno binary copied successfully to ${denoDest1} using elevated permissions`);
		} else {
			console.error(`unexpected error: ${error.message}`);
			process.exit(1);
		}
	}
}

// Helper function to copy file with elevated permissions on Windows
async function elevatedCopy(src, dest) {
	if (platform === 'win32') {
		const { execSync } = require('child_process');
		const command = `powershell -Command "Start-Process cmd -Verb RunAs -ArgumentList '/c copy ${src} ${dest}' -WindowStyle Hidden -Wait"`;
		execSync(command);
	} else {
		// For non-Windows platforms, fall back to regular copy
		await fs.copyFile(src, dest);
	}
	await fs.chmod(dest, 0o755); // ensure the binary is executable
}

// Helper function to copy file and set permissions
async function copyFile(src, dest) {
	await fs.copyFile(src, dest);
	await fs.chmod(dest, 0o755); // ensure the binary is executable
}

/* ########## Linux ########## */
if (platform == 'linux') {
	// Install APT packages
	try {
		await $`sudo apt-get update`;

		for (const name of config.linux.aptPackages) {
			await $`sudo apt-get install -y ${name}`;
		}
	} catch (error) {
		console.error("error installing apps via apt, %s", error.message);
	}


	// Copy screenpipe binary
	console.log('copying screenpipe binary for linux...');
	const potentialPaths = [
		path.join(__dirname, '..', '..', '..', '..', 'target', 'release', 'screenpipe'),
		path.join(__dirname, '..', '..', '..', '..', 'target', 'x86_64-unknown-linux-gnu', 'release', 'screenpipe'),
		path.join(__dirname, '..', '..', '..', 'target', 'release', 'screenpipe'),
		path.join(__dirname, '..', '..', 'target', 'release', 'screenpipe'),
		path.join(__dirname, '..', 'target', 'release', 'screenpipe'),
		'/home/runner/work/screenpipe/screenpipe/target/release/screenpipe',
	];

	let copied = false;
	for (const screenpipeSrc of potentialPaths) {
		if (process.env['SKIP_SCREENPIPE_SETUP']) {
			copied = true;
			break;
		}
		const screenpipeDest = path.join(cwd, 'screenpipe-x86_64-unknown-linux-gnu');
		try {
			await fs.copyFile(screenpipeSrc, screenpipeDest);
			console.log(`screenpipe binary copied successfully from ${screenpipeSrc}`);
			copied = true;
			break;
		} catch (error) {
			console.warn(`failed to copy screenpipe binary from ${screenpipeSrc}:`, error);
		}
	}

	if (!copied) {
		console.error("failed to copy screenpipe binary from any potential path.");
		// uncomment the following line if you want the script to exit on failure
		// process.exit(1);
	}
}

/* ########## Windows ########## */
if (platform == 'windows') {
	const wgetPath = await findWget();

	console.log('Copying screenpipe binary...');

	const potentialPaths = [
		path.join(__dirname, '..', '..', 'target', 'release', 'screenpipe.exe'),
		path.join(__dirname, '..', '..', 'target', 'x86_64-pc-windows-msvc', 'release', 'screenpipe.exe'),
		path.join(__dirname, '..', 'target', 'release', 'screenpipe.exe'),
		path.join(__dirname, '..', '..', 'target', 'release', 'screenpipe.exe'),
		'D:\\a\\screenpipe\\screenpipe\\target\\release\\screenpipe.exe',
	];

	let copied = false;
	for (const screenpipeSrc of potentialPaths) {
		if (process.env['SKIP_SCREENPIPE_SETUP']) {
			copied = true;
			break;
		}
		const screenpipeDest = path.join(cwd, 'screenpipe-x86_64-pc-windows-msvc.exe');
		try {
			await fs.copyFile(screenpipeSrc, screenpipeDest);
			console.log(`Screenpipe binary copied successfully from ${screenpipeSrc}`);
			copied = true;
			break;
		} catch (error) {
			console.warn(`Failed to copy screenpipe binary from ${screenpipeSrc}:`, error);
		}
	}

	if (!copied) {
		console.error("Failed to copy screenpipe binary from any potential path.");
		// Uncomment the following line if you want the script to exit on failure
		// process.exit(1);
	}

	// Setup FFMPEG
	if (!(await fs.exists(config.ffmpegRealname))) {
		await $`${wgetPath} --no-config --tries=10 --retry-connrefused --waitretry=10 --secure-protocol=auto --no-check-certificate --show-progress ${config.windows.ffmpegUrl} -O ${config.windows.ffmpegName}.7z`
		await $`'C:\\Program Files\\7-Zip\\7z.exe' x ${config.windows.ffmpegName}.7z`
		await $`mv ${config.windows.ffmpegName} ${config.ffmpegRealname}`
		await $`rm -rf ${config.windows.ffmpegName}.7z`
		await $`mv ${config.ffmpegRealname}/lib/x64/* ${config.ffmpegRealname}/lib/`
	}

	// Setup ONNX Runtime
	const onnxRuntimeName = "onnxruntime-win-x64-gpu-1.19.2";
	const onnxRuntimeLibs = `${onnxRuntimeName}.zip`;
	const onnxRuntimeUrl = `https://github.com/microsoft/onnxruntime/releases/download/v1.19.2/${onnxRuntimeLibs}`
	if (!(await fs.exists(onnxRuntimeName))) {
		console.log('Setting up ONNX Runtime libraries for Windows...')
		try {
			await $`${wgetPath} --no-config -nc --no-check-certificate --show-progress ${onnxRuntimeUrl} -O ${onnxRuntimeLibs}`
			await $`unzip ${onnxRuntimeLibs} || tar -xf ${onnxRuntimeLibs} || echo "Done extracting"`;
			await $`rm -rf ${onnxRuntimeLibs} || rm ${onnxRuntimeLibs} -Recurse -Force || echo "Done cleaning up zip"`;
			console.log('ONNX Runtime libraries for Windows set up successfully.')
		} catch (error) {
			console.error('Error downloading or extracting ONNX Runtime:', error);
			console.log('Attempting alternative download method...');
			// Add alternative download method here
		}
	} else {
		console.log('ONNX Runtime libraries for Windows already exists.')
	}

	// Setup OpenBlas
	if (!(await fs.exists(config.openblasRealname)) && hasFeature('openblas')) {
		await $`${wgetPath} --no-config -nc --show-progress ${config.windows.openBlasUrl} -O ${config.windows.openBlasName}.zip`
		await $`"C:\\Program Files\\7-Zip\\7z.exe" x ${config.windows.openBlasName}.zip -o${config.openblasRealname}`
		await $`rm ${config.windows.openBlasName}.zip`
		fs.cp(path.join(config.openblasRealname, 'include'), path.join(config.openblasRealname, 'lib'), { recursive: true, force: true })
		// It tries to link only openblas.lib but our is libopenblas.lib`
		fs.cp(path.join(config.openblasRealname, 'lib/libopenblas.lib'), path.join(config.openblasRealname, 'lib/openblas.lib'))
	}

	// Setup CLBlast
	if (!(await fs.exists(config.clblastRealname)) && !hasFeature('cuda')) {
		await $`${wgetPath} --no-config -nc --show-progress ${config.windows.clblastUrl} -O ${config.windows.clblastName}.zip`
		await $`"C:\\Program Files\\7-Zip\\7z.exe" x ${config.windows.clblastName}.zip` // 7z file inside
		await $`"C:\\Program Files\\7-Zip\\7z.exe" x ${config.windows.clblastName}.7z` // Inner folder
		await $`mv ${config.windows.clblastName} ${config.clblastRealname}`
		await $`rm ${config.windows.clblastName}.zip`
		await $`rm ${config.windows.clblastName}.7z`
	}

	// Setup vcpkg packages with environment variables set inline
	await $`SystemDrive=${process.env.SYSTEMDRIVE} SystemRoot=${process.env.SYSTEMROOT} windir=${process.env.WINDIR} C:\\vcpkg\\vcpkg.exe install ${config.windows.vcpkgPackages}`.quiet()
}

async function getMostRecentBinaryPath(targetArch, paths) {
	const validPaths = await Promise.all(paths.map(async (path) => {
		if (await fs.exists(path)) {
			const { stdout } = await $`file ${path}`.quiet();
			const binaryArch = stdout.includes('arm64') ? 'arm64' :
				stdout.includes('x86_64') ? 'x86_64' : null;
			if (binaryArch === targetArch) {
				const stat = await fs.stat(path);
				return { path, mtime: stat.mtime };
			}
		}
		return null;
	}));

	const filteredPaths = validPaths.filter(Boolean);

	if (filteredPaths.length === 0) {
		return null;
	}

	return filteredPaths.reduce((mostRecent, current) =>
		current.mtime > mostRecent.mtime ? current : mostRecent
	).path;
}
/* ########## macOS ########## */
if (platform == 'macos') {

	const architectures = ['arm64', 'x86_64'];

	for (const arch of architectures) {
		if (process.env['SKIP_SCREENPIPE_SETUP']) {
			break;
		}
		console.log(`Setting up screenpipe bin for ${arch}...`);

		if (arch === 'arm64') {
			const paths = [
				"../../target/aarch64-apple-darwin/release/screenpipe",
				"../../target/release/screenpipe"
			];

			const mostRecentPath = await getMostRecentBinaryPath('arm64', paths);
			if (mostRecentPath) {
				await $`cp ${mostRecentPath} screenpipe-aarch64-apple-darwin`;
				console.log(`Copied most recent arm64 screenpipe binary from ${mostRecentPath}`);
			} else {
				console.error("No suitable arm64 screenpipe binary found");
			}

			try {
				// if the binary exists, hard code the fucking dylib
				if (await fs.exists('screenpipe-aarch64-apple-darwin') && !isDevMode) {
					await $`install_name_tool -change screenpipe-vision/lib/libscreenpipe_arm64.dylib @rpath/../Frameworks/libscreenpipe_arm64.dylib ./screenpipe-aarch64-apple-darwin`
					await $`install_name_tool -change screenpipe-vision/lib/libscreenpipe.dylib @rpath/../Frameworks/libscreenpipe.dylib ./screenpipe-aarch64-apple-darwin`
					console.log(`hard coded the dylib`);
				} else if (await fs.exists('screenpipe-aarch64-apple-darwin') && isDevMode) {
					await $`install_name_tool -change screenpipe-vision/lib/libscreenpipe_arm64.dylib @executable_path/../Frameworks/libscreenpipe_arm64.dylib ./screenpipe-aarch64-apple-darwin`
					await $`install_name_tool -change screenpipe-vision/lib/libscreenpipe.dylib @executable_path/../Frameworks/libscreenpipe.dylib ./screenpipe-aarch64-apple-darwin`
					await $`install_name_tool -add_rpath @executable_path/../Frameworks ./screenpipe-aarch64-apple-darwin`
					console.log(`Updated dylib paths for arm64 in dev mode`);
				}
			} catch (error) {
				console.error('Error updating dylib paths:', error);
			}


		} else if (arch === 'x86_64') {
			// copy screenpipe binary (more recent one)
			const paths = [
				"../../target/x86_64-apple-darwin/release/screenpipe",
				"../../target/release/screenpipe"
			];

			const mostRecentPath = await getMostRecentBinaryPath('x86_64', paths);

			if (mostRecentPath) {
				await $`cp ${mostRecentPath} screenpipe-x86_64-apple-darwin`;
				console.log(`Copied most recent x86_64 screenpipe binary from ${mostRecentPath}`);
			} else {
				console.error("No suitable x86_64 screenpipe binary found");
			}

			try {
				// hard code the dylib
				if (await fs.exists('screenpipe-x86_64-apple-darwin') && !isDevMode) {
					await $`install_name_tool -change screenpipe-vision/lib/libscreenpipe_x86_64.dylib @rpath/../Frameworks/libscreenpipe_x86_64.dylib ./screenpipe-x86_64-apple-darwin`
					await $`install_name_tool -change screenpipe-vision/lib/libscreenpipe.dylib @rpath/../Frameworks/libscreenpipe.dylib ./screenpipe-x86_64-apple-darwin`
					console.log(`hard coded the dylib`);
				}
			} catch (error) {
				console.error('Error updating dylib paths:', error);
			}

		}

		console.log(`screenpipe for ${arch} set up successfully.`);
	}


	// Setup FFMPEG
	if (!(await fs.exists(config.ffmpegRealname))) {
		await $`wget --no-config -nc ${config.macos.ffmpegUrl} -O ${config.macos.ffmpegName}.tar.xz`
		await $`tar xf ${config.macos.ffmpegName}.tar.xz`
		await $`mv ${config.macos.ffmpegName} ${config.ffmpegRealname}`
		await $`rm ${config.macos.ffmpegName}.tar.xz`
	} else {
		console.log('FFMPEG already exists');
	}

	// Move and rename ffmpeg and ffprobe binaries
	const ffmpegSrc = path.join(cwd, config.ffmpegRealname, 'bin', 'ffmpeg');

	// For x86_64
	await fs.copyFile(ffmpegSrc, path.join(cwd, 'ffmpeg-x86_64-apple-darwin'));

	// For arm64
	await fs.copyFile(ffmpegSrc, path.join(cwd, 'ffmpeg-aarch64-apple-darwin'));

	console.log('Moved and renamed ffmpeg binary for externalBin');

}



// Development hints
if (!process.env.GITHUB_ENV) {
	console.log('\nCommands to build 🔨:')
	// Get relative path to screenpipe-app-tauri folder
	const relativePath = path.relative(originalCWD, path.join(cwd, '..'))
	if (originalCWD != cwd && relativePath != '') {
		console.log(`cd ${relativePath}`)
	}
	console.log('bun install')
	if (platform == 'windows') {
		console.log(`$env:FFMPEG_DIR = "${exports.ffmpeg}"`)
		console.log(`$env:OPENBLAS_PATH = "${exports.openBlas}"`)
		console.log(`$env:LIBCLANG_PATH = "${exports.libClang}"`)
		console.log(`$env:PATH += "${exports.cmake}"`)
	}
	if (!process.env.GITHUB_ENV) {
		console.log('bun tauri build')
	}
}

// Config Github ENV
if (process.env.GITHUB_ENV) {
	console.log('Adding ENV')
	if (platform == 'macos' || platform == 'windows') {
		const ffmpeg = `FFMPEG_DIR=${exports.ffmpeg}\n`
		console.log('Adding ENV', ffmpeg)
		await fs.appendFile(process.env.GITHUB_ENV, ffmpeg)
	}
	if (platform == 'macos') {
		const embed_metal = 'WHISPER_METAL_EMBED_LIBRARY=ON'
		await fs.appendFile(process.env.GITHUB_ENV, embed_metal)
	}
	if (platform == 'windows') {
		const openblas = `OPENBLAS_PATH=${exports.openBlas}\n`
		console.log('Adding ENV', openblas)
		await fs.appendFile(process.env.GITHUB_ENV, openblas)
	}
}

// Modify the installOllamaSidecar function
async function installOllamaSidecar() {
	const ollamaDir = path.join(__dirname, '..', 'src-tauri');
	const ollamaVersion = 'v0.3.13';

	let ollamaExe, ollamaUrl;

	if (platform === 'windows') {
		ollamaExe = 'ollama-x86_64-pc-windows-msvc.exe';
		ollamaUrl = `https://github.com/ollama/ollama/releases/download/${ollamaVersion}/ollama-windows-amd64.zip`;
	} else if (platform === 'macos') {
		ollamaUrl = `https://github.com/ollama/ollama/releases/download/${ollamaVersion}/ollama-darwin`;
	} else if (platform === 'linux') {
		ollamaExe = 'ollama-x86_64-unknown-linux-gnu';
		ollamaUrl = `https://github.com/ollama/ollama/releases/download/${ollamaVersion}/ollama-linux-amd64.tgz`;
	} else {
		throw new Error('Unsupported platform');
	}


	if ((platform === 'macos' && await fs.exists(path.join(ollamaDir, "ollama-aarch64-apple-darwin"))
		&& await fs.exists(path.join(ollamaDir, "ollama-x86_64-apple-darwin"))) ||
		(platform !== 'macos' && await fs.exists(path.join(ollamaDir, ollamaExe)))) {
		console.log('ollama sidecar already exists. skipping installation.');
		return;
	}

	try {
		await fs.mkdir(ollamaDir, { recursive: true });
		const downloadPath = path.join(ollamaDir, path.basename(ollamaUrl));

		console.log('Downloading Ollama...');
		if (platform === 'windows') {
			await $`powershell -command "Invoke-WebRequest -Uri '${ollamaUrl}' -OutFile '${downloadPath}'"`;
		} else {
			await $`wget --no-config -q --show-progress ${ollamaUrl} -O ${downloadPath}`;
		}

		console.log('Extracting Ollama...');
		if (platform === 'windows') {
			await $`powershell -command "Expand-Archive -Path '${downloadPath}' -DestinationPath '${ollamaDir}'"`;
			await fs.rename(path.join(ollamaDir, 'ollama.exe'), path.join(ollamaDir, ollamaExe));
		} else if (platform === 'linux') {
			await $`tar -xzf "${downloadPath}" -C "${ollamaDir}"`;
			await fs.rename(path.join(ollamaDir, 'bin/ollama'), path.join(ollamaDir, ollamaExe));
		} else if (platform === 'macos') {
			// just copy to both archs
			await fs.copyFile(downloadPath, path.join(ollamaDir, "ollama-aarch64-apple-darwin"));
			await fs.copyFile(downloadPath, path.join(ollamaDir, "ollama-x86_64-apple-darwin"));
		}

		console.log('Setting permissions...');
		if (platform === 'linux') {
			await fs.chmod(path.join(ollamaDir, ollamaExe), '755');
		} else if (platform === 'macos') {
			await fs.chmod(path.join(ollamaDir, "ollama-aarch64-apple-darwin"), '755');
			await fs.chmod(path.join(ollamaDir, "ollama-x86_64-apple-darwin"), '755');
		}

		console.log('Cleaning up...');
		if (platform !== 'macos') {
			await fs.unlink(downloadPath);
		}

		if (platform === 'linux') {
			// Remove older library versions to save storage
			const libDir = path.join(ollamaDir, 'lib/ollama');
			const oldLibs = [
				'libcublas.so.11',
				'libcublas.so.11.5.1.109',
				'libcublasLt.so.11',
				'libcublasLt.so.11.5.1.109',
				'libcudart.so.11.0',
				'libcudart.so.11.3.109',
				'libggml_cuda_v11.so',
				'libhipblas.so.2',
				'librocblas.so.4'
			];

			for (const lib of oldLibs) {
				try {
					await fs.unlink(path.join(libDir, lib));
					console.log(`removed old library: ${lib}`);
				} catch (error) {
					console.warn(`failed to remove ${lib}:`, error.message);
				}
			}

		}

		console.log('ollama sidecar installed successfully');
	} catch (error) {
		console.error('error installing ollama sidecar:', error);
		throw error;
	}
}

// Near the end of the script, call these functions
await installDeno();
await copyDenoBinary();
await installOllamaSidecar().catch(console.error);

// --dev or --build
const action = process.argv?.[2]
if (action?.includes('--build' || action.includes('--dev'))) {
	process.chdir(path.join(cwd, '..'))
	process.env['FFMPEG_DIR'] = exports.ffmpeg
	if (platform === 'windows') {
		process.env['OPENBLAS_PATH'] = exports.openBlas
		process.env['CLBlast_DIR'] = exports.clblast
		process.env['LIBCLANG_PATH'] = exports.libClang
		process.env['PATH'] = `${process.env['PATH']};${exports.cmake}`
	}
	if (platform == 'macos') {
		process.env['WHISPER_METAL_EMBED_LIBRARY'] = 'ON'
	}
	await $`bun install`
	await $`bunx tauri ${action.includes('--dev') ? 'dev' : 'build'}`
}

