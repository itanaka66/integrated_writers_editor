; Integrated writers Editor (INE) — fully self-contained ("native") Windows
; installer. Unlike installer\windows\ine.iss (which ships a
; docker-compose.yml and requires Docker Desktop as a separate
; prerequisite), this installer packages EVERYTHING needed to run INE as
; plain Windows processes: a portable Node.js runtime, an embedded Python
; runtime with all of apps/api's dependencies pre-installed, a portable
; Qdrant binary, and PostgreSQL binaries, plus this repo's own api/web
; code — see installer\windows-native\bundle.ps1, which must be run FIRST
; to produce the dist-native\ directory this script packages.
;
; No prerequisite software is required on the target machine at all.
; Trade-off vs. installer\windows\: a much larger download (bundles whole
; language runtimes + a database server), and this installer's copies of
; Node/Python/Postgres/Qdrant receive no automatic updates — see the
; comments in bundle.ps1 for how to bump each pinned version.
;
; Build: installer\windows-native\bundle.ps1 then `iscc ine-native.iss`
; (see .github/workflows/build-native-windows-installer.yml for the CI
; pipeline that does both steps on a Windows runner).
; Requires: Inno Setup 6 (https://jrsoftware.org/isinfo.php)

#define AppName "Integrated writers Editor (INE) - Native"
#define AppVersion "0.6.0"
#define AppPublisher "INE"

[Setup]
; Deliberately a DIFFERENT AppId than installer\windows\ine.iss so the two
; installers are treated as separate apps (can coexist / be
; installed-uninstalled independently, e.g. side by side while evaluating
; which one to keep).
AppId={{7C4A1E9B-2D65-4F91-8A3C-1B9E7D4F602A}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\INE-Native
DefaultGroupName=INE (Native)
OutputDir=..\..\dist
OutputBaseFilename=INE-Native-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern

; The bundled runtimes/binaries are placed under {app} itself and Postgres
; needs to write its data directory somewhere writable by the current user
; without elevation, so this installs per-user by default just like the
; Docker installer.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
UninstallDisplayIcon={app}\launch.ps1

[Languages]
Name: "japanese"; MessagesFile: "compiler:Languages\Japanese.isl"
Name: "english";  MessagesFile: "compiler:Default.isl"

[CustomMessages]
japanese.LaunchSetup=今すぐ起動する
english.LaunchSetup=Launch now
japanese.CreateDesktopIcon=デスクトップにショートカットを作成する
english.CreateDesktopIcon=Create a desktop shortcut
japanese.DeleteDataPrompt=PostgreSQLとQdrantのローカルデータフォルダを削除しますか？この操作は元に戻せません。
english.DeleteDataPrompt=Delete the local PostgreSQL and Qdrant data folders? This cannot be undone.

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; The entire dist-native\ staging directory produced by bundle.ps1 —
; runtime\{node,python,qdrant,postgres}, api\, web\, and .env.example.
; recursesubdirs/createallsubdirs packages it as-is.
Source: "..\..\dist-native\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "launch.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "stop.ps1";   DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\README.md"; DestDir: "{app}"; Flags: ignoreversion isreadme

[Icons]
Name: "{group}\INEを起動 (Native)"; Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launch.ps1"""; WorkingDir: "{app}"
Name: "{group}\INEを停止 (Native)"; Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\stop.ps1"""; WorkingDir: "{app}"
Name: "{autodesktop}\INE (Native)"; Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launch.ps1"""; \
    Tasks: desktopicon; WorkingDir: "{app}"

[Run]
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launch.ps1"""; \
    Description: "{cm:LaunchSetup}"; Flags: postinstall skipifsilent nowait

[UninstallRun]
; Best-effort: stop the background processes before files are removed.
; Errors are ignored (e.g. if the app was never launched, there's nothing
; to stop) via `runasoriginaluser` + a non-fatal exit code being fine for
; uninstall steps.
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\stop.ps1"""; \
    Flags: runhidden; RunOnceId: "StopINENative"

[UninstallDelete]
; .env (generated admin password / local overrides) and the app's own
; files are removed. The PostgreSQL data directory (pgdata\) and Qdrant's
; storage (qdrant-storage\) are deliberately NOT listed here — see the
; [Code] section below, which asks the user before deleting either, since
; unlike the Docker installer (where volumes live inside Docker, outside
; this installer's own file tree) this installer's data directories ARE
; inside {app} and would otherwise be silently deleted by a normal
; uninstall.
Type: files; Name: "{app}\.env"

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
begin
  // (placeholder for future install-time steps; kept minimal since all
  // real setup work — initdb, .env generation — happens in launch.ps1 on
  // first run, not here, so the installer itself stays a simple file copy.)
end;

function InitializeUninstall(): Boolean;
begin
  Result := True;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataDir: String;
  QdrantDir: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    DataDir := ExpandConstant('{app}\pgdata');
    QdrantDir := ExpandConstant('{app}\qdrant-storage');
    if DirExists(DataDir) or DirExists(QdrantDir) then
    begin
      if MsgBox(ExpandConstant('{cm:DeleteDataPrompt}'), mbConfirmation, MB_YESNO) = IDYES then
      begin
        if DirExists(DataDir) then DelTree(DataDir, True, True, True);
        if DirExists(QdrantDir) then DelTree(QdrantDir, True, True, True);
      end;
    end;
  end;
end;
