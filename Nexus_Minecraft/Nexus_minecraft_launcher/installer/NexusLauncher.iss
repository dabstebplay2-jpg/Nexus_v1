; Nexus Launcher installer
; Build with:
;   ISCC.exe /DAppVersion=0.7.1 installer\NexusLauncher.iss

#ifndef AppVersion
#define AppVersion "0.7.1"
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
