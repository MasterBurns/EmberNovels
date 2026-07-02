[Setup]
AppName=EmberNovels
AppVersion=0.1.0.1
DefaultDirName={userpf}\EmberNovels
DefaultGroupName=EmberNovels
OutputDir=output
OutputBaseFilename=EmberNovels-Setup
Compression=lzma
SolidCompression=yes
DisableProgramGroupPage=yes
DisableWelcomePage=no

[Files]
Source: "dist\EmberNovels.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "version.json"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\EmberNovels"; Filename: "{app}\EmberNovels.exe"
Name: "{commondesktop}\EmberNovels"; Filename: "{app}\EmberNovels.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Erstelle eine Desktop-Verknüpfung"; GroupDescription: "Zusätzliche Symbole:"

[Run]
Filename: "{app}\EmberNovels.exe"; Description: "EmberNovels jetzt starten"; Flags: postinstall nowait
