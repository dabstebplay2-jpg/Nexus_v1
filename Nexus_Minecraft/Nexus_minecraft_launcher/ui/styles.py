APP_STYLE = r'''
* {
    font-family: "Segoe UI";
    color: #E5E7EB;
    font-size: 13px;
    outline: none;
}

QMainWindow {
    background-color: #020617;
}

QWidget {
    background-color: transparent;
}

QMainWindow::separator {
    background: rgba(148, 163, 184, 0.15);
    width: 1px;
    height: 1px;
}

#AppContent {
    background: qlineargradient(
        x1:0, y1:0, x2:1, y2:1,
        stop:0 #020617,
        stop:0.42 #071427,
        stop:1 #130B20
    );
}

QScrollArea,
#ScrollArea {
    background: transparent;
    border: none;
}

QScrollBar:vertical {
    background: rgba(15, 23, 42, 150);
    width: 10px;
    border-radius: 5px;
    margin: 4px 0 4px 0;
}

QScrollBar::handle:vertical {
    background: rgba(74, 222, 128, 165);
    border-radius: 5px;
    min-height: 28px;
}

QScrollBar::handle:vertical:hover {
    background: rgba(74, 222, 128, 210);
}

QScrollBar::add-line:vertical,
QScrollBar::sub-line:vertical,
QScrollBar::add-page:vertical,
QScrollBar::sub-page:vertical,
QScrollBar::add-line:horizontal,
QScrollBar::sub-line:horizontal,
QScrollBar::add-page:horizontal,
QScrollBar::sub-page:horizontal {
    height: 0px;
    width: 0px;
    background: transparent;
}

QScrollBar:horizontal {
    background: rgba(15, 23, 42, 150);
    height: 10px;
    border-radius: 5px;
    margin: 0 4px;
}

QScrollBar::handle:horizontal {
    background: rgba(74, 222, 128, 165);
    border-radius: 5px;
    min-width: 28px;
}

QLineEdit,
QTextEdit,
QPlainTextEdit,
QComboBox,
QSpinBox,
QDoubleSpinBox {
    background-color: rgba(10, 16, 32, 0.82);
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 16px;
    color: #F8FAFC;
    padding: 12px 14px;
    font-size: 14px;
    selection-background-color: rgba(34, 197, 94, 0.28);
}

QTextEdit,
QPlainTextEdit {
    padding: 10px 12px;
}

QLineEdit:hover,
QTextEdit:hover,
QPlainTextEdit:hover,
QComboBox:hover,
QSpinBox:hover,
QDoubleSpinBox:hover {
    border: 1px solid rgba(74, 222, 128, 0.35);
}

QLineEdit:focus,
QTextEdit:focus,
QPlainTextEdit:focus,
QComboBox:focus,
QSpinBox:focus,
QDoubleSpinBox:focus {
    border: 1px solid #22C55E;
    background-color: rgba(12, 20, 38, 0.92);
}

QComboBox::drop-down {
    border: none;
    width: 24px;
}

QComboBox::down-arrow {
    image: none;
    width: 0;
    height: 0;
}

QComboBox QAbstractItemView {
    background-color: #0B1427;
    border: 1px solid rgba(74, 222, 128, 0.24);
    border-radius: 12px;
    padding: 6px;
    selection-background-color: rgba(34, 197, 94, 0.22);
    selection-color: #F8FAFC;
}

QPushButton {
    border: none;
}

QPushButton:disabled {
    color: #64748B;
    border-color: rgba(100, 116, 139, 0.18);
    background-color: rgba(15, 23, 42, 0.45);
}

QCheckBox {
    spacing: 10px;
    color: #E2E8F0;
}

QCheckBox::indicator {
    width: 18px;
    height: 18px;
    border-radius: 6px;
    border: 1px solid rgba(148, 163, 184, 0.3);
    background: rgba(15, 23, 42, 0.92);
}

QCheckBox::indicator:checked {
    background: #22C55E;
    border-color: #4ADE80;
}

QSlider::groove:horizontal {
    height: 8px;
    background: rgba(15, 23, 42, 0.85);
    border-radius: 4px;
}

QSlider::sub-page:horizontal {
    background: #22C55E;
    border-radius: 4px;
}

QSlider::handle:horizontal {
    background: #86EFAC;
    border: 2px solid #22C55E;
    width: 22px;
    margin: -8px 0;
    border-radius: 11px;
}

QProgressBar {
    background: rgba(15, 23, 42, 0.75);
    border: 1px solid rgba(148, 163, 184, 0.12);
    border-radius: 8px;
}

QProgressBar::chunk {
    background: #22C55E;
    border-radius: 8px;
}

QDialog, QMessageBox {
    background-color: #050C1B;
}

QTabWidget::pane,
QFrame#Card,
QFrame#Panel,
QFrame#DashboardPanel,
QFrame#MiniCard,
QFrame#SettingsOptionsBox,
QFrame#DownloadSummaryCard,
QFrame#InstanceCard,
QFrame#ModResultCard,
QFrame#DownloadTaskCard,
QFrame#DownloadTaskCardActive,
QFrame#HeroStatCard,
QFrame#SettingsStatCard,
QFrame#SkinCard,
QFrame#AccountRow,
QFrame#AccountRowActive,
QFrame#DetailInfoRow,
QWidget#InstanceCard,
QWidget#Card {
    background-color: rgba(10, 17, 32, 0.84);
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 22px;
}

QFrame#DownloadTaskCardActive,
QFrame#AccountRowActive,
QFrame#InstanceDashboardRowActive,
QFrame#HeroStatCard:hover,
QFrame#DashboardPanel:hover,
QFrame#InstanceCard:hover,
QWidget#InstanceCard:hover,
QFrame#ModResultCard:hover,
QFrame#SkinCard:hover,
QFrame#DownloadSummaryCard:hover,
QFrame#DownloadTaskCard:hover,
QFrame#MiniCard:hover,
QFrame#Card:hover,
QWidget#Card:hover,
QFrame#SettingsStatCard:hover,
QFrame#DetailInfoRow:hover {
    border: 1px solid rgba(74, 222, 128, 0.32);
    background-color: rgba(11, 20, 37, 0.94);
}

#PageTitle {
    color: #F8FAFC;
    font-size: 40px;
    font-weight: 900;
    letter-spacing: 0.3px;
}

#PageDescription,
#PanelText,
#MutedText {
    color: #CBD5E1;
    font-size: 14px;
    line-height: 1.4em;
}

#PanelText,
#MutedText {
    color: #B6C2D1;
}

#SectionTitle,
#PanelTitle {
    color: #F8FAFC;
    font-size: 20px;
    font-weight: 900;
}

#CardTitle,
#InstanceTitle,
#SettingsSectionLabel {
    color: #F8FAFC;
    font-size: 16px;
    font-weight: 800;
}

#InstanceMeta,
#EmptyText {
    color: #8CA0B8;
    font-size: 12px;
    font-weight: 600;
}

#EmptyText {
    font-size: 14px;
}

#StatusBadge,
#SmallBadge,
#InstanceBadge,
#ModTag {
    background-color: rgba(22, 101, 52, 0.22);
    border: 1px solid rgba(74, 222, 128, 0.24);
    color: #D1FAE5;
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 800;
}

#StatusBadge {
    padding: 7px 14px;
}

#DownloadBigNumber,
#HeroStatValue,
#SettingsRamValue {
    color: #F8FAFC;
    font-size: 18px;
    font-weight: 900;
}

#DownloadBigNumber {
    font-size: 28px;
}

#HeroStatTitle {
    color: #A9BDD4;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.6px;
    text-transform: uppercase;
}

#MiniProgress,
#BigProgress,
#DownloadProgress {
    background: rgba(15, 23, 42, 0.88);
    border: 1px solid rgba(148, 163, 184, 0.08);
    border-radius: 999px;
}

#MiniProgress::chunk,
#BigProgress::chunk,
#DownloadProgress::chunk {
    background: qlineargradient(
        x1:0, y1:0, x2:1, y2:0,
        stop:0 #22C55E,
        stop:1 #4ADE80
    );
    border-radius: 999px;
}

/* Sidebar */
#Sidebar {
    background-color: rgba(2, 6, 23, 0.98);
    border-right: 1px solid rgba(148, 163, 184, 0.12);
}

#SidebarLogoCard {
    background-color: rgba(11, 18, 32, 0.95);
    border: 1px solid rgba(34, 197, 94, 0.22);
    border-radius: 26px;
}

#NexusLogoTitle {
    color: #F8FAFC;
    font-size: 25px;
    font-weight: 900;
    letter-spacing: 3px;
}

#NexusLogoSubtitle {
    color: #94A3B8;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 2px;
}

#SidebarSectionTitle {
    color: #64748B;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 3px;
    padding-left: 8px;
}

#SidebarNavButton {
    text-align: left;
    color: #D5DFEB;
    background-color: transparent;
    border: 1px solid transparent;
    border-radius: 16px;
    padding: 0 16px;
    font-size: 14px;
    font-weight: 800;
}

#SidebarNavButton:hover {
    background-color: rgba(34, 197, 94, 0.08);
    border: 1px solid rgba(74, 222, 128, 0.2);
    color: #F8FAFC;
}

#SidebarNavButton[active="true"] {
    background-color: #22C55E;
    border: 1px solid #4ADE80;
    color: white;
}

#SidebarNavButton[disabledPage="true"] {
    color: #64748B;
}

#SidebarProfileCard {
    background-color: rgba(11, 18, 32, 0.96);
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-radius: 20px;
}

#SidebarProfileName {
    color: #F8FAFC;
    font-size: 14px;
    font-weight: 900;
}

#SidebarProfileStatus {
    color: #86EFAC;
    font-size: 12px;
    font-weight: 700;
}

#SidebarProfileArrow {
    color: #94A3B8;
    font-size: 16px;
    font-weight: 900;
}

/* Topbar */
#Topbar {
    background-color: rgba(2, 6, 23, 0.72);
    border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

#TopbarTitle {
    color: #F8FAFC;
    font-size: 20px;
    font-weight: 900;
}

#TopbarSubtitle {
    color: #6B829B;
    font-size: 12px;
    font-weight: 700;
}

#TopbarSearch,
#SearchInput,
QLineEdit#Input {
    background-color: rgba(10, 17, 32, 0.82);
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 16px;
    color: #F8FAFC;
    padding: 12px 16px;
    font-size: 14px;
}

#TopbarSearch:focus,
#SearchInput:focus,
QLineEdit#Input:focus {
    border: 1px solid #22C55E;
}

#TopbarStatusButton {
    background-color: rgba(20, 83, 45, 0.32);
    border: 1px solid rgba(74, 222, 128, 0.24);
    border-radius: 16px;
    color: #D1FAE5;
    padding: 12px 18px;
    font-size: 13px;
    font-weight: 900;
}

#TopbarPlayButton,
#HeroPlayButton,
#PrimaryButton {
    background-color: #22C55E;
    border: 1px solid #4ADE80;
    border-radius: 16px;
    color: white;
    padding: 12px 22px;
    font-size: 14px;
    font-weight: 900;
}

#TopbarPlayButton {
    padding: 13px 28px;
    font-size: 15px;
}

#TopbarPlayButton:hover,
#HeroPlayButton:hover,
#PrimaryButton:hover {
    background-color: #16A34A;
}

#SecondaryButton,
#SmallGhostButton,
#WideGhostButton,
#GhostButton {
    background-color: rgba(15, 23, 42, 0.78);
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 16px;
    color: #E2E8F0;
    padding: 11px 18px;
    font-size: 13px;
    font-weight: 800;
}

#SmallGhostButton {
    padding: 9px 14px;
    font-size: 12px;
}

#WideGhostButton {
    padding: 12px 18px;
}

#SecondaryButton:hover,
#SmallGhostButton:hover,
#WideGhostButton:hover,
#GhostButton:hover {
    border: 1px solid rgba(74, 222, 128, 0.3);
    background-color: rgba(17, 30, 54, 0.92);
}

#DangerButton {
    background-color: rgba(127, 29, 29, 0.38);
    border: 1px solid rgba(248, 113, 113, 0.28);
    border-radius: 16px;
    color: #FECACA;
    padding: 11px 18px;
    font-size: 13px;
    font-weight: 800;
}

#DangerButton:hover {
    background-color: rgba(153, 27, 27, 0.55);
}

/* Dashboard / Home */
#MinecraftHero {
    background-color: rgba(6, 14, 29, 0.98);
    border: 1px solid rgba(74, 222, 128, 0.16);
    border-radius: 30px;
}

#HeroWelcome {
    color: #B6C2D1;
    font-size: 16px;
    font-weight: 700;
}

#HeroTitle {
    color: #F8FAFC;
    font-size: 42px;
    font-weight: 900;
}

#HeroSubtitle {
    color: #D4DEE8;
    font-size: 15px;
}

#QuickActionCard,
#OverviewStatCard,
#ActivityRow,
#RecommendationRow,
#InstanceDashboardRow,
#InstanceDashboardRowActive {
    background-color: rgba(10, 17, 32, 0.78);
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-radius: 20px;
}

#QuickActionCard:hover,
#OverviewStatCard:hover,
#ActivityRow:hover,
#RecommendationRow:hover,
#InstanceDashboardRow:hover,
#InstanceDashboardRowActive:hover {
    border: 1px solid rgba(74, 222, 128, 0.26);
    background-color: rgba(11, 20, 37, 0.92);
}

#OverviewStatLabel {
    color: #8CA0B8;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
}

#OverviewStatValue {
    color: #F8FAFC;
    font-size: 26px;
    font-weight: 900;
}

#OverviewStatMeta,
#ActivityMeta {
    color: #A9BDD4;
    font-size: 12px;
}

#QuickActionTitle {
    color: #F8FAFC;
    font-size: 15px;
    font-weight: 900;
}

#QuickActionText {
    color: #B8C4D5;
    font-size: 13px;
}

#BlockIcon,
#DownloadIcon,
#OverviewIcon,
#QuickActionIcon {
    background-color: rgba(20, 83, 45, 0.2);
    border: 1px solid rgba(74, 222, 128, 0.18);
    border-radius: 14px;
    color: #D1FAE5;
}

#MiniPlayButton {
    background-color: rgba(34, 197, 94, 0.16);
    border: 1px solid rgba(74, 222, 128, 0.24);
    border-radius: 12px;
}

#MiniPlayButton:hover {
    background-color: rgba(34, 197, 94, 0.28);
}

/* Mods */
#ModIconImage,
#ModIconBox,
#ModDetailsIcon,
#ModScreenshot {
    background-color: rgba(15, 23, 42, 0.82);
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-radius: 16px;
}

#ModDescriptionBox,
#LogViewer {
    background-color: rgba(5, 10, 22, 0.96);
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 18px;
    color: #DDE6F1;
}

#LogViewer {
    font-family: "Consolas", "JetBrains Mono", monospace;
    font-size: 12px;
    line-height: 1.3em;
}

#DownloadStatus {
    color: #DDE6F1;
    font-size: 13px;
    font-weight: 700;
}

#DownloadError {
    background: rgba(127, 29, 29, 0.22);
    border: 1px solid rgba(248, 113, 113, 0.18);
    border-radius: 14px;
    color: #FECACA;
    padding: 10px 12px;
}

#BottomStatusBar {
    background-color: rgba(2, 6, 23, 0.88);
    border-top: 1px solid rgba(148, 163, 184, 0.12);
}

#BottomStatusText {
    color: #94A3B8;
    font-size: 12px;
    font-weight: 700;
}

/* Detail pages and tabs */
#InstanceDetailHero {
    background: qlineargradient(
        x1:0, y1:0, x2:1, y2:1,
        stop:0 rgba(10, 17, 32, 0.96),
        stop:0.55 rgba(11, 26, 45, 0.94),
        stop:1 rgba(20, 83, 45, 0.28)
    );
    border: 1px solid rgba(74, 222, 128, 0.2);
    border-radius: 28px;
}

#InstanceDetailTabs::pane {
    background-color: rgba(10, 17, 32, 0.72);
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-radius: 22px;
    top: -1px;
}

QTabBar::tab {
    background-color: rgba(15, 23, 42, 0.72);
    border: 1px solid rgba(148, 163, 184, 0.14);
    color: #A9BDD4;
    border-top-left-radius: 14px;
    border-top-right-radius: 14px;
    padding: 10px 15px;
    margin-right: 4px;
    font-weight: 800;
}

QTabBar::tab:hover {
    color: #F8FAFC;
    border-color: rgba(74, 222, 128, 0.25);
}

QTabBar::tab:selected {
    background-color: rgba(34, 197, 94, 0.2);
    color: #D1FAE5;
    border-color: rgba(74, 222, 128, 0.34);
}

#AccountRow, #AccountRowActive, #SkinCard {
    background-color: rgba(10, 17, 32, 0.84);
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 20px;
}

#AccountRowActive {
    border: 1px solid rgba(74, 222, 128, 0.32);
    background-color: rgba(20, 83, 45, 0.18);
}

#Card {
    background-color: rgba(10, 17, 32, 0.84);
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 22px;
}

#Input {
    background-color: rgba(10, 16, 32, 0.82);
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 16px;
    color: #F8FAFC;
    padding: 10px 14px;
}

#MiniCard {
    background-color: rgba(10, 17, 32, 0.82);
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-radius: 20px;
}

/* Mods page compact UI */
#ToggleFiltersButton {
    background-color: rgba(34, 197, 94, 0.15);
    border: 1px solid rgba(74, 222, 128, 0.30);
    border-radius: 16px;
    color: #D1FAE5;
    padding: 8px 16px;
    font-size: 12px;
    font-weight: 800;
}
#ToggleFiltersButton:hover {
    background-color: rgba(34, 197, 94, 0.28);
    border: 1px solid rgba(74, 222, 128, 0.50);
}

#CompactStatus {
    color: #8CA0B8;
    font-size: 12px;
    font-weight: 700;
    padding: 0 8px;
}

#ModsAdvancedFilters {
    background: transparent;
    border: none;
}

/* Update bar */
#UpdateBar {
    background-color: rgba(34, 197, 94, 0.10);
    border-bottom: 1px solid rgba(74, 222, 128, 0.20);
}
#UpdateBarReady {
    background-color: rgba(34, 197, 94, 0.18);
    border-bottom: 1px solid rgba(74, 222, 128, 0.35);
}
#UpdateStatusText {
    color: #D1FAE5;
    font-size: 12px;
    font-weight: 700;
}
#BottomStatusText {
    color: #8CA0B8;
    font-size: 11px;
    font-weight: 600;
}

'''


def _read_saved_theme():
    try:
        import json
        from storage.paths import DATA_DIR
        settings_file = DATA_DIR / "launcher_settings.json"
        if not settings_file.exists():
            return "dark"
        data = json.loads(settings_file.read_text(encoding="utf-8"))
        return data.get("theme", "dark")
    except Exception:
        return "dark"


AMOLED_STYLE = r"""
QMainWindow, #AppContent, #Sidebar, #Topbar, #BottomStatusBar {
    background-color: #000000;
}
#AppContent {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #000000, stop:0.55 #020617, stop:1 #08030F);
}
"""

LIGHT_STYLE = r"""
* {
    color: #0F172A;
}

QMainWindow {
    background-color: #F8FAFC;
}

#AppContent {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #F8FAFC, stop:0.55 #EEF6FF, stop:1 #F5F3FF);
}

#Sidebar {
    background-color: #FFFFFF;
    border-right: 1px solid rgba(15, 23, 42, 0.10);
}

#Topbar, #BottomStatusBar {
    background-color: rgba(248, 250, 252, 0.96);
    border-color: rgba(15, 23, 42, 0.10);
}

#SidebarLogoCard,
#SidebarProfileCard,
#DashboardPanel,
#Panel,
#Card,
#MiniCard,
#SettingsOptionsBox,
#DownloadSummaryCard,
#InstanceCard,
#ModResultCard,
#DownloadTaskCard,
#DownloadTaskCardActive,
#HeroStatCard,
#SettingsStatCard,
#SkinCard,
#AccountRow,
#AccountRowActive,
#DetailInfoRow,
#QuickActionCard,
#OverviewStatCard,
#ActivityRow,
#RecommendationRow,
QWidget#InstanceCard,
QWidget#Card {
    background-color: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(15, 23, 42, 0.10);
}

#PageTitle,
#PanelTitle,
#SectionTitle,
#CardTitle,
#InstanceTitle,
#TopbarTitle,
#NexusLogoTitle,
#HeroTitle,
#HeroStatValue,
#OverviewStatValue,
#DownloadBigNumber,
#SettingsRamValue {
    color: #0F172A;
}

#PageDescription,
#PanelText,
#MutedText,
#TopbarSubtitle,
#InstanceMeta,
#OverviewStatMeta,
#ActivityMeta,
#QuickActionText,
#EmptyText {
    color: #475569;
}

QLineEdit,
QTextEdit,
QPlainTextEdit,
QComboBox,
#TopbarSearch,
#SearchInput,
#Input {
    background-color: rgba(255, 255, 255, 0.95);
    border: 1px solid rgba(15, 23, 42, 0.14);
    color: #0F172A;
}

#LogViewer,
#ModDescriptionBox {
    background-color: #FFFFFF;
    color: #0F172A;
}

/* Mods page compact UI */
#ToggleFiltersButton {
    background-color: rgba(34, 197, 94, 0.15);
    border: 1px solid rgba(74, 222, 128, 0.30);
    border-radius: 16px;
    color: #D1FAE5;
    padding: 8px 16px;
    font-size: 12px;
    font-weight: 800;
}
#ToggleFiltersButton:hover {
    background-color: rgba(34, 197, 94, 0.28);
    border: 1px solid rgba(74, 222, 128, 0.50);
}

#CompactStatus {
    color: #8CA0B8;
    font-size: 12px;
    font-weight: 700;
    padding: 0 8px;
}

#ModsAdvancedFilters {
    background: transparent;
    border: none;
}

"""


COMFORT_STYLE = '\n/* Nexus Comfort Minecraft UI Patch */\n* {\n    font-size: 12px;\n}\n\n#AppContent {\n    background: qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #07110B, stop:0.45 #071827, stop:1 #120A1B);\n}\n\nQScrollBar:horizontal {\n    height: 0px;\n    background: transparent;\n}\nQScrollBar::handle:horizontal {\n    height: 0px;\n    background: transparent;\n}\n\nQFrame#DashboardPanel,\nQFrame#Panel,\nQFrame#Card,\nQFrame#MiniCard,\nQFrame#DownloadSummaryCard,\nQFrame#InstanceCard,\nQFrame#ModResultCard,\nQFrame#DownloadTaskCard,\nQFrame#HeroStatCard,\nQFrame#SettingsStatCard,\nQFrame#QuickActionCard,\nQFrame#OverviewStatCard,\nQFrame#ActivityRow,\nQFrame#RecommendationRow,\nQFrame#InstanceDashboardRow,\nQFrame#InstanceDashboardRowActive,\nQWidget#Card {\n    border-radius: 16px;\n    background-color: rgba(8, 17, 31, 0.82);\n    border: 1px solid rgba(99, 155, 112, 0.22);\n}\n\nQFrame#DashboardPanel:hover,\nQFrame#ModResultCard:hover,\nQFrame#QuickActionCard:hover,\nQFrame#OverviewStatCard:hover,\nQFrame#InstanceDashboardRow:hover,\nQFrame#InstanceDashboardRowActive:hover {\n    border: 1px solid rgba(72, 199, 116, 0.42);\n    background-color: rgba(10, 23, 38, 0.92);\n}\n\n#Sidebar {\n    background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #050807, stop:0.55 #020403, stop:1 #000000);\n}\n\n#SidebarLogoCard {\n    border-radius: 20px;\n    background: qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 rgba(13, 31, 23, 0.96), stop:1 rgba(8, 15, 29, 0.96));\n}\n\n#SidebarProfileCard {\n    border-radius: 18px;\n    background-color: rgba(10, 18, 32, 0.94);\n}\n#SidebarProfileCard[active="true"] {\n    border: 1px solid rgba(74, 222, 128, 0.62);\n    background-color: rgba(22, 101, 52, 0.28);\n}\n\n#SidebarNavButton {\n    border-radius: 14px;\n    padding: 0 13px;\n    font-size: 13px;\n}\n#SidebarNavButton[active="true"] {\n    color: #06110B;\n    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #22C55E, stop:1 #86EFAC);\n}\n\n#Topbar {\n    background-color: rgba(5, 12, 24, 0.88);\n}\n#TopbarTitle {\n    font-size: 18px;\n}\n#TopbarSubtitle {\n    font-size: 11px;\n}\n\n#PageTitle {\n    font-size: 30px;\n    letter-spacing: 0px;\n}\n#HeroTitle {\n    font-size: 34px;\n}\n#PanelTitle,\n#SectionTitle {\n    font-size: 18px;\n}\n#CardTitle,\n#InstanceTitle,\n#QuickActionTitle {\n    font-size: 15px;\n}\n#PageDescription,\n#PanelText,\n#MutedText,\n#QuickActionText {\n    font-size: 12px;\n}\n#OverviewStatValue,\n#DownloadBigNumber {\n    font-size: 22px;\n}\n#HeroStatValue,\n#SettingsRamValue {\n    font-size: 16px;\n}\n#HeroStatTitle,\n#OverviewStatLabel {\n    font-size: 10px;\n    letter-spacing: 0.8px;\n}\n\nQLineEdit,\nQTextEdit,\nQPlainTextEdit,\nQComboBox,\n#TopbarSearch,\n#SearchInput,\nQLineEdit#Input {\n    border-radius: 13px;\n    padding: 9px 12px;\n    font-size: 12px;\n    min-height: 22px;\n}\n\n#TopbarThemeButton,\n#TopbarStatusButton,\n#TopbarPlayButton,\n#HeroPlayButton,\n#PrimaryButton,\n#SecondaryButton,\n#SmallGhostButton,\n#WideGhostButton,\n#GhostButton,\n#DangerButton {\n    border-radius: 13px;\n    padding: 9px 14px;\n    font-size: 12px;\n}\n\n#TopbarThemeButton {\n    background-color: rgba(15, 23, 42, 0.78);\n    border: 1px solid rgba(148, 163, 184, 0.18);\n    color: #D1FAE5;\n    font-weight: 900;\n}\n\n#TopbarPlayButton {\n    padding: 10px 22px;\n    color: #06110B;\n}\n\n#MinecraftHero {\n    border-radius: 20px;\n    background-color: rgba(7, 19, 22, 0.90);\n}\n\n#HeroWelcome {\n    font-size: 13px;\n}\n\n#HeroSubtitle {\n    font-size: 13px;\n}\n\n#StatusBadge,\n#SmallBadge,\n#InstanceBadge,\n#ModTag {\n    padding: 4px 9px;\n    border-radius: 8px;\n    font-size: 11px;\n    background-color: rgba(34, 197, 94, 0.12);\n}\n\n#OverviewIcon,\n#QuickActionIcon,\n#BlockIcon,\n#DownloadIcon,\n#HeroStatIcon {\n    border-radius: 10px;\n}\n\n#MinecraftShortcutCard {\n    text-align: left;\n    background-color: rgba(14, 24, 39, 0.88);\n    border: 1px solid rgba(99, 155, 112, 0.22);\n    border-radius: 16px;\n    color: #E5F7EA;\n    padding: 12px 14px;\n    font-size: 12px;\n    font-weight: 800;\n}\n#MinecraftShortcutCard:hover {\n    background-color: rgba(22, 101, 52, 0.23);\n    border-color: rgba(74, 222, 128, 0.42);\n}\n\n#ToggleFiltersButton {\n    background-color: rgba(34, 197, 94, 0.15);\n    border: 1px solid rgba(74, 222, 128, 0.30);\n    border-radius: 13px;\n    color: #D1FAE5;\n    padding: 8px 14px;\n    font-size: 12px;\n    font-weight: 800;\n}\n#ToggleFiltersButton:hover {\n    background-color: rgba(34, 197, 94, 0.28);\n    border: 1px solid rgba(74, 222, 128, 0.50);\n}\n\n#CompactStatus {\n    color: #8CA0B8;\n    font-size: 11px;\n    font-weight: 700;\n    padding: 0 6px;\n}\n\n#ModsAdvancedFilters {\n    background: transparent;\n    border: none;\n}\n\n#ModResultCard {\n    border-radius: 18px;\n}\n#ModIconImage,\n#ModIconBox,\n#ModDetailsIcon {\n    border-radius: 12px;\n}\n\nQProgressBar,\n#MiniProgress,\n#BigProgress,\n#DownloadProgress {\n    max-height: 7px;\n    border-radius: 4px;\n}\n\n#BottomStatusBar {\n    min-height: 24px;\n    max-height: 28px;\n}\n'

LIGHT_COMFORT_STYLE = '\n/* Light theme comfort overrides */\n#AppContent {\n    background: qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #F5FAF2, stop:0.55 #EEF7EA, stop:1 #EEF6FF);\n}\n#Sidebar {\n    background-color: #F8FFF7;\n}\n#SidebarProfileCard[active="true"] {\n    background-color: rgba(187, 247, 208, 0.78);\n}\n#MinecraftShortcutCard {\n    background-color: rgba(255, 255, 255, 0.92);\n    border-color: rgba(15, 23, 42, 0.12);\n    color: #0F172A;\n}\n#ToggleFiltersButton {\n    background-color: rgba(34, 197, 94, 0.12);\n    border: 1px solid rgba(34, 197, 94, 0.30);\n    border-radius: 16px;\n    color: #065F46;\n    padding: 8px 16px;\n    font-size: 12px;\n    font-weight: 800;\n}\n#ToggleFiltersButton:hover {\n    background-color: rgba(34, 197, 94, 0.22);\n}\n#TopbarThemeButton {\n    background-color: rgba(255, 255, 255, 0.90);\n    color: #0F172A;\n}\n'

def get_app_style(theme=None):
    theme = (theme or _read_saved_theme() or "dark").lower()

    if theme == "amoled":
        return APP_STYLE + AMOLED_STYLE + COMFORT_STYLE

    if theme == "light":
        return APP_STYLE + LIGHT_STYLE + COMFORT_STYLE + LIGHT_COMFORT_STYLE

    return APP_STYLE + COMFORT_STYLE
