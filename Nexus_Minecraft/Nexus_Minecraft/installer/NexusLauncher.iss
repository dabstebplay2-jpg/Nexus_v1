; Nexus Launcher installer
; Build with:
;   ISCC.exe /DAppVersion=1.1.4.2 installer\NexusLauncher.iss

#ifndef AppVersion
#define AppVersion "1.1.4.2"
#endif

#define AppName "Nexus Launcher"
#define AppExeName "NexusLauncher.exe"
#define SourceExe "..\release\NexusLauncher-" + AppVersion + "-win-x64.exe"

[Setup]
AppId={{B5D3C6F2-4C92-4F01-9E4F-41B0E3B85C47}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Nexus Launcher
AppPublisherURL=https://github.com/dabstebplay2-jpg/Nexus_mincraft_laucher
AppSupportURL=https://github.com/dabstebplay2-jpg/Nexus_mincraft_laucher/issues
AppUpdatesURL=https://github.com/dabstebplay2-jpg/Nexus_mincraft_laucher/releases
DefaultDirName={localappdata}\Programs\Nexus Launcher
DefaultGroupName=Nexus Launcher
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\release
OutputBaseFilename=NexusLauncherSetup-{#AppVersion}-win-x64
SetupIconFile=..\assets\nexus.ico
UninstallDisplayIcon={app}\{#AppExeName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
MinVersion=10.0
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Создать ярлык на рабочем столе"; GroupDescription: "Ярлыки:"; Flags: checkedonce

[Files]
Source: "{#SourceExe}"; DestDir: "{app}"; DestName: "{#AppExeName}"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion isreadme
Source: "helpers\*.cmd"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\Nexus Launcher"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"
Name: "{autoprograms}\Nexus Launcher - Проверить обновления"; Filename: "{app}\Nexus Check Updates.cmd"; WorkingDir: "{app}"
Name: "{autoprograms}\Nexus Launcher - Диагностика"; Filename: "{app}\Nexus Diagnostics.cmd"; WorkingDir: "{app}"
Name: "{autoprograms}\Nexus Launcher - Очистить кэш обновлений"; Filename: "{app}\Nexus Repair Cache.cmd"; WorkingDir: "{app}"
Name: "{autoprograms}\Nexus Launcher - Сайт"; Filename: "{app}\Open Nexus Website.cmd"; WorkingDir: "{app}"
Name: "{autodesktop}\Nexus Launcher"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{autoprograms}\Удалить Nexus Launcher"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Запустить Nexus Launcher"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; User data is intentionally kept in %APPDATA%\NexusLauncher.
; Do not delete instances, accounts, logs or downloaded packs automatically.

[Code]
const
  AppUninstallKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{B5D3C6F2-4C92-4F01-9E4F-41B0E3B85C47}_is1';

procedure StopRunningNexusLauncher();
var
  ResultCode: Integer;
begin
  Log('Stopping running Nexus Launcher processes before install/update.');
  Exec(
    ExpandConstant('{cmd}'),
    '/C taskkill /IM "{#AppExeName}" /T /F >NUL 2>NUL',
    '',
    SW_HIDE,
    ewWaitUntilTerminated,
    ResultCode
  );
  Log('taskkill Nexus Launcher exit code: ' + IntToStr(ResultCode));
  Sleep(1200);
end;

function ExtractExeAndParams(CommandLine: string; var ExePath: string; var Params: string): Boolean;
var
  EndQuote: Integer;
  SpacePos: Integer;
begin
  CommandLine := Trim(CommandLine);
  ExePath := '';
  Params := '';

  if CommandLine = '' then
  begin
    Result := False;
    Exit;
  end;

  if Copy(CommandLine, 1, 1) = '"' then
  begin
    EndQuote := Pos('"', Copy(CommandLine, 2, MaxInt));
    if EndQuote > 0 then
    begin
      ExePath := Copy(CommandLine, 2, EndQuote - 1);
      Params := Trim(Copy(CommandLine, EndQuote + 2, MaxInt));
    end;
  end
  else
  begin
    SpacePos := Pos(' ', CommandLine);
    if SpacePos > 0 then
    begin
      ExePath := Copy(CommandLine, 1, SpacePos - 1);
      Params := Trim(Copy(CommandLine, SpacePos + 1, MaxInt));
    end
    else
    begin
      ExePath := CommandLine;
    end;
  end;

  Result := ExePath <> '';
end;

procedure RunPreviousUninstaller(RootKey: Integer);
var
  UninstallCommand: string;
  ExePath: string;
  Params: string;
  ResultCode: Integer;
begin
  if RegQueryStringValue(RootKey, AppUninstallKey, 'QuietUninstallString', UninstallCommand) or
     RegQueryStringValue(RootKey, AppUninstallKey, 'UninstallString', UninstallCommand) then
  begin
    if ExtractExeAndParams(UninstallCommand, ExePath, Params) and FileExists(ExePath) then
    begin
      Log('Removing previous Nexus Launcher version: ' + ExePath);
      Params := Trim(Params + ' /VERYSILENT /SUPPRESSMSGBOXES /NORESTART');
      Exec(ExePath, Params, '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      Log('Previous Nexus Launcher uninstaller exit code: ' + IntToStr(ResultCode));
    end;
  end;
end;

function InitializeSetup(): Boolean;
begin
  StopRunningNexusLauncher();
  RunPreviousUninstaller(HKCU);
  RunPreviousUninstaller(HKLM);
  Result := True;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
  begin
    StopRunningNexusLauncher();
  end;
end;
