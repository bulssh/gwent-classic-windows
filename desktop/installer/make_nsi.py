"""Generates installer.nsi for the Tauri build (Windows x64).
The uninstaller removes exactly the files that were installed; game data (decks, settings) is
only removed if the user says so."""
import os, sys, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERSION = sys.argv[1]
# folder of the compiled executable (cross-compiled GNU build or native MSVC build)
BUILD = os.path.join(ROOT, sys.argv[2] if len(sys.argv) > 2 else os.path.join("src-tauri", "target", "x86_64-pc-windows-gnu", "release"))
STAGE = os.path.join(ROOT, "dist", "app")
OUT = os.path.join(ROOT, "dist", f"Gwent-Classic-{VERSION}-Setup.exe")

shutil.rmtree(STAGE, ignore_errors=True)
os.makedirs(STAGE)
shutil.copy(os.path.join(BUILD, "gwent-classic.exe"), os.path.join(STAGE, "Gwent Classic.exe"))
# the GNU build needs the WebView2 loader next to the executable; the MSVC build links it statically
if os.path.exists(os.path.join(BUILD, "WebView2Loader.dll")):
    shutil.copy(os.path.join(BUILD, "WebView2Loader.dll"), os.path.join(STAGE, "WebView2Loader.dll"))
shutil.copy(os.path.join(ROOT, "..", "LICENSE"), os.path.join(STAGE, "LICENSE.txt"))
shutil.copy(os.path.join(ROOT, "..", "NOTICE.md"), os.path.join(STAGE, "NOTICE.txt"))
files = sorted(os.listdir(STAGE))
size_kb = sum(os.path.getsize(os.path.join(STAGE, f)) for f in files) // 1024

install_files = "\n".join(f'  File "{os.path.join(STAGE, f)}"' for f in files)
uninstall_files = "\n".join(f'  Delete "$INSTDIR\\{f}"' for f in files)

nsi = f"""Unicode True
ManifestDPIAware true
SetCompressor /SOLID lzma
SetCompressorDictSize 64

!define APPNAME "Gwent Classic"
!define APPEXE "Gwent Classic.exe"
!define VERSION "{VERSION}"
!define IDENTIFIER "io.github.bulssh.gwentclassic"
!define UNINSTEXE "Desinstaller Gwent Classic.exe"
!define UNINSTKEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\GwentClassic"
!define WV2KEY "SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}}"
!define WV2KEY_USER "Software\\Microsoft\\EdgeUpdate\\Clients\\{{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}}"

Name "${{APPNAME}}"
OutFile "{OUT}"
InstallDir "$LOCALAPPDATA\\Programs\\Gwent Classic"
InstallDirRegKey HKCU "${{UNINSTKEY}}" "InstallLocation"
RequestExecutionLevel user
BrandingText "Gwent Classic ${{VERSION}}"
ShowInstDetails nevershow
ShowUninstDetails nevershow

VIProductVersion "${{VERSION}}.0"
VIAddVersionKey /LANG=1036 "ProductName" "Gwent Classic"
VIAddVersionKey /LANG=1036 "FileDescription" "Installation de Gwent Classic"
VIAddVersionKey /LANG=1036 "FileVersion" "${{VERSION}}"
VIAddVersionKey /LANG=1036 "ProductVersion" "${{VERSION}}"
VIAddVersionKey /LANG=1036 "LegalCopyright" "Gwent Classic (asundr) - assets The Witcher 3 (c) CD PROJEKT RED"

!include "MUI2.nsh"
!include "LogicLib.nsh"
!define MUI_ICON "{ROOT}/src-tauri/icons/icon.ico"
!define MUI_UNICON "{ROOT}/src-tauri/icons/icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TEXT "Cet assistant va installer Gwent Classic ${{VERSION}}, le Gwynt de The Witcher 3, en application Windows native (Tauri + WebView2).$\\r$\\n$\\r$\\nAucun droit administrateur n'est nécessaire. Une ancienne version 1.x éventuellement installée est remplacée automatiquement.$\\r$\\n$\\r$\\nLa musique de Gwynt peut être extraite de votre installation de The Witcher 3 (lecture seule) pour être écoutée hors ligne ; sinon elle est diffusée en streaming. Le reste du jeu fonctionne hors ligne."
!define MUI_FINISHPAGE_RUN "$INSTDIR\\${{APPEXE}}"
!define MUI_FINISHPAGE_RUN_TEXT "Lancer Gwent Classic"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "French"

!macro CHECK_RUNNING_FN PREFIX
Function ${{PREFIX}}CheckRunning
  retry:
  FindWindow $0 "" "Gwent Classic"
  StrCmp $0 0 done
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Gwent Classic est ouvert. Fermez-le puis cliquez sur Réessayer." /SD IDCANCEL IDRETRY retry
  Abort
  done:
FunctionEnd
!macroend
!insertmacro CHECK_RUNNING_FN ""
!insertmacro CHECK_RUNNING_FN "un."

Function .onInit
  ; WebView2 runtime (present on Windows 11 and up-to-date Windows 10)
  ReadRegStr $0 HKLM "${{WV2KEY}}" "pv"
  ${{If}} $0 == ""
    ReadRegStr $0 HKCU "${{WV2KEY_USER}}" "pv"
  ${{EndIf}}
  ${{If}} $0 == ""
  ${{OrIf}} $0 == "0.0.0.0"
    MessageBox MB_YESNO|MB_ICONEXCLAMATION "Le composant Microsoft Edge WebView2 n'a pas été trouvé. Il est nécessaire au jeu.$\\r$\\n$\\r$\\nOuvrir la page de téléchargement Microsoft ?" /SD IDNO IDNO wv2_done
    ExecShell "open" "https://developer.microsoft.com/microsoft-edge/webview2/#download"
    wv2_done:
  ${{EndIf}}
FunctionEnd

Section "Gwent Classic" SecMain
  SectionIn RO
  Call CheckRunning
  ; previous version (1.x Electron or 2.x): uninstall it silently first, game data is kept
  ReadRegStr $1 HKCU "${{UNINSTKEY}}" "InstallLocation"
  ReadRegStr $2 HKCU "${{UNINSTKEY}}" "UninstallString"
  ${{If}} $2 != ""
  ${{AndIf}} $1 != ""
    ExecWait '$2 /S _?=$1'
    Delete "$1\\Désinstaller Gwent Classic.exe"
    Delete "$1\\Desinstaller Gwent Classic.exe"
    RMDir "$1"
  ${{EndIf}}
  SetOutPath "$INSTDIR"
{install_files}
  WriteUninstaller "$INSTDIR\\${{UNINSTEXE}}"
  CreateShortCut "$DESKTOP\\Gwent Classic.lnk" "$INSTDIR\\${{APPEXE}}"
  CreateShortCut "$SMPROGRAMS\\Gwent Classic.lnk" "$INSTDIR\\${{APPEXE}}"
  WriteRegStr HKCU "${{UNINSTKEY}}" "DisplayName" "Gwent Classic"
  WriteRegStr HKCU "${{UNINSTKEY}}" "DisplayVersion" "${{VERSION}}"
  WriteRegStr HKCU "${{UNINSTKEY}}" "Publisher" "bulssh (d'après Gwent Classic d'asundr)"
  WriteRegStr HKCU "${{UNINSTKEY}}" "DisplayIcon" "$INSTDIR\\${{APPEXE}},0"
  WriteRegStr HKCU "${{UNINSTKEY}}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${{UNINSTKEY}}" "UninstallString" '"$INSTDIR\\${{UNINSTEXE}}"'
  WriteRegStr HKCU "${{UNINSTKEY}}" "QuietUninstallString" '"$INSTDIR\\${{UNINSTEXE}}" /S'
  WriteRegDWORD HKCU "${{UNINSTKEY}}" "NoModify" 1
  WriteRegDWORD HKCU "${{UNINSTKEY}}" "NoRepair" 1
  WriteRegDWORD HKCU "${{UNINSTKEY}}" "EstimatedSize" {size_kb}
SectionEnd

Section "Uninstall"
  Call un.CheckRunning
  Delete "$DESKTOP\\Gwent Classic.lnk"
  Delete "$SMPROGRAMS\\Gwent Classic.lnk"
{uninstall_files}
  Delete "$INSTDIR\\LICENSE-gwent-classic.txt"
  Delete "$INSTDIR\\${{UNINSTEXE}}"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${{UNINSTKEY}}"
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Supprimer aussi vos decks et réglages enregistrés ?$\\r$\\n$\\r$\\nChoisissez Non pour les retrouver si vous réinstallez le jeu." /SD IDNO IDNO keep_data
  RMDir /r "$LOCALAPPDATA\\${{IDENTIFIER}}"
  RMDir /r "$APPDATA\\${{IDENTIFIER}}"
  keep_data:
SectionEnd
"""
dst = os.path.join(ROOT, "installer", "installer.nsi")
with open(dst, "w", encoding="utf-8-sig") as fh:
    fh.write(nsi)
print(dst, files, size_kb // 1024, "MB")
