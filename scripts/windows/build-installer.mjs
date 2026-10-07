import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = join(root, 'scripts/windows');
const release = join(root, 'release');
const toolsDir = join(release, '.tools');
const nodeVersion = '24.15.0';
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Generá este instalador en Windows x64.');
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('La versión debe tener formato mayor.menor.parche.');
if (!process.env.npm_execpath) throw new Error('Ejecutá npm run build:installer desde el proyecto.');

const compiler = [
  process.env.ISCC_PATH,
  join(toolsDir, 'inno/ISCC.exe'),
  'C:/Program Files/Inno Setup 7/ISCC.exe',
  'C:/Program Files (x86)/Inno Setup 6/ISCC.exe',
].find(path => path && existsSync(path));
if (!compiler) throw new Error('Instalá Inno Setup 6.4 o posterior o indicá su ISCC.exe en ISCC_PATH.');

function run(command, args, cwd = root, extraEnv = {}) {
  execFileSync(command, args, { cwd, stdio: 'inherit', windowsHide: true, env: { ...process.env, ...extraEnv } });
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo descargar ${url} (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

mkdirSync(toolsDir, { recursive: true });
const nodeExe = join(toolsDir, `node-${nodeVersion}.exe`);
const sums = (await download(`https://nodejs.org/dist/v${nodeVersion}/SHASUMS256.txt`)).toString('utf8');
const expectedHash = sums.split(/\r?\n/).find(line => line.endsWith('  win-x64/node.exe'))?.split('  ')[0];
if (!expectedHash) throw new Error('No se encontró el checksum del runtime oficial.');
if (!existsSync(nodeExe)) writeFileSync(nodeExe, await download(`https://nodejs.org/dist/v${nodeVersion}/win-x64/node.exe`));
const runtimeHash = createHash('sha256').update(readFileSync(nodeExe)).digest('hex');
if (runtimeHash !== expectedHash) throw new Error('El runtime descargado no coincide con el checksum oficial.');
const nodeLicense = await download(`https://raw.githubusercontent.com/nodejs/node/v${nodeVersion}/LICENSE`);

run(process.execPath, [process.env.npm_execpath, 'run', 'build']);
const stage = mkdtempSync(join(release, '.build-'));
const backend = join(stage, 'backend');
mkdirSync(join(stage, 'runtime'), { recursive: true });
mkdirSync(backend, { recursive: true });
cpSync(nodeExe, join(stage, 'runtime/node.exe'));
writeFileSync(join(stage, 'runtime/LICENSE.txt'), nodeLicense);
cpSync(join(root, 'backend/dist/src'), join(backend, 'dist/src'), { recursive: true });
cpSync(join(root, 'frontend/dist'), join(stage, 'frontend'), { recursive: true });
cpSync(join(source, 'runtime.cjs'), join(stage, 'runtime.cjs'));
cpSync(join(root, 'backend/prisma/schema.prisma'), join(backend, 'prisma/schema.prisma'));
cpSync(join(root, 'backend/prisma/migrations'), join(backend, 'prisma/migrations'), { recursive: true });
cpSync(join(root, 'backend/package.json'), join(backend, 'package.json'));
cpSync(join(root, 'backend/package-lock.json'), join(backend, 'package-lock.json'));
run(process.execPath, [process.env.npm_execpath, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], backend);
cpSync(join(root, 'backend/node_modules/.prisma/client'), join(backend, 'node_modules/.prisma/client'), { recursive: true });
for (const engine of ['schema-engine-windows.exe', 'query_engine-windows.dll.node']) {
  cpSync(join(root, 'backend/node_modules/@prisma/engines', engine), join(backend, 'node_modules/@prisma/engines', engine));
}

const iconPath = join(stage, 'vape-society.ico');
run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', readFileSync(join(source, 'build-icon.ps1'), 'utf8')], root, {
  VAPE_BUILD_LOGO_PATH: join(root, 'frontend/public/brand/vape-society-logo.png'),
  VAPE_BUILD_ICON_PATH: iconPath,
});
const assemblyPath = join(release, 'LauncherAssemblyInfo.cs');
writeFileSync(assemblyPath, `using System.Reflection;\n[assembly: AssemblyTitle("Vape Society")]\n[assembly: AssemblyProduct("Vape Society")]\n[assembly: AssemblyVersion("${version}.0")]\n[assembly: AssemblyFileVersion("${version}.0")]\n`, 'utf8');
const csc = join(process.env.WINDIR || 'C:/Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
run(csc, ['/nologo', '/target:winexe', '/platform:x64', '/codepage:65001', '/utf8output',
  `/out:${join(stage, 'Vape Society.exe')}`, `/win32icon:${iconPath}`,
  '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll', join(source, 'Launcher.cs'), assemblyPath]);

writeFileSync(join(stage, 'LEEME.txt'), `Vape Society ${version}\n\nAbrí el sistema desde el acceso directo. Se utiliza el navegador predeterminado.\nPara cerrar el sistema, usá el icono de Vape Society junto al reloj y elegí Cerrar sistema.\n\nDatos: %LOCALAPPDATA%\\VapeSociety\\core.db\nBackups: %LOCALAPPDATA%\\VapeSociety\\backups\nRegistros de inicio: %LOCALAPPDATA%\\VapeSociety\\logs\n\nLa primera ejecución crea una base nueva sin productos ni ventas.\nCompletá los datos del negocio y las categorías en Configuración.\nLas actualizaciones y la desinstalación conservan la base y los backups.\nSi hay migraciones pendientes, se genera una copia antes de aplicarlas.\nPara importar datos, usá Configuración > Datos > Importar datos.\n\nIncluye Node.js ${nodeVersion}; no requiere npm ni Node.js instalado.\nAcceso local: http://127.0.0.1:43120\n`, 'utf8');

function assertNoUserData(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) assertNoUserData(path);
    else if (/\.(db|sqlite|sqlite3)(-|$)/i.test(entry.name) || entry.name === '.env') {
      throw new Error(`El paquete contiene datos locales: ${path}`);
    }
  }
}
assertNoUserData(stage);
const metadata = { version, nodeVersion, runtimeSha256: runtimeHash, payloadPath: stage, createdAt: new Date().toISOString() };
writeFileSync(join(release, 'build-info.json'), JSON.stringify(metadata, null, 2), 'utf8');
run(compiler, ['/Q', `/DAppVersion=${version}`, `/DPayloadPath=${stage}`, `/DOutputPath=${release}`, join(source, 'installer.iss')]);
const installer = join(release, `Vape-Society-Setup-${version}-x64.exe`);
const checksum = createHash('sha256').update(readFileSync(installer)).digest('hex');
writeFileSync(`${installer}.sha256`, `${checksum}  Vape-Society-Setup-${version}-x64.exe\n`, 'utf8');
console.log(`\nInstalador generado: ${installer}\nSHA-256: ${checksum}`);
