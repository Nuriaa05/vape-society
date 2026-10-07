#ifndef AppVersion
  #error Indicá AppVersion al compilar.
#endif
#ifndef PayloadPath
  #error Indicá PayloadPath al compilar.
#endif
#ifndef OutputPath
  #error Indicá OutputPath al compilar.
#endif

[Setup]
AppId={{FC3765D2-24E3-4517-B252-F193699A791C}
AppName=Vape Society
AppVersion={#AppVersion}
AppPublisher=Vape Society
DefaultDirName={localappdata}\Programs\Vape Society
DefaultGroupName=Vape Society
DisableProgramGroupPage=no
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.19041
OutputDir={#OutputPath}
OutputBaseFilename=Vape-Society-Setup-{#AppVersion}-x64
SetupIconFile={#PayloadPath}\vape-society.ico
UninstallDisplayIcon={app}\Vape Society.exe
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
InfoBeforeFile={#PayloadPath}\LEEME.txt

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear un acceso directo en el escritorio"

[Dirs]
Name: "{localappdata}\VapeSociety\backups"; Flags: uninsneveruninstall
Name: "{localappdata}\VapeSociety\logs"; Flags: uninsneveruninstall

[Files]
Source: "{#PayloadPath}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Vape Society"; Filename: "{app}\Vape Society.exe"
Name: "{group}\Datos y backups"; Filename: "{localappdata}\VapeSociety"
Name: "{group}\Desinstalar"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Vape Society"; Filename: "{app}\Vape Society.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Vape Society.exe"; Description: "Abrir Vape Society"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\Vape Society.exe"; Parameters: "--stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopVapeSociety"

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ExitCode: Integer;
begin
  Result := '';
  if FileExists(ExpandConstant('{app}\Vape Society.exe')) then
  begin
    if not Exec(ExpandConstant('{app}\Vape Society.exe'), '--stop', '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then
      Result := 'No se pudo cerrar Vape Society. Cerralo desde el icono junto al reloj y volvé a intentar.'
    else if ExitCode <> 0 then
      Result := 'Vape Society todavía está en ejecución. Cerralo antes de actualizar.';
  end;
end;
