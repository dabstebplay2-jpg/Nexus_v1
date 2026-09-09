# Nexus Sidebar Logo Fix

Исправление обрезанного текста `NEXUS` в левом верхнем блоке лаунчера.

Что сделано:
- ширина sidebar в обычном режиме увеличена до 248 px;
- уменьшены внутренние отступы logo-card;
- иконка бренда стала 56x56 вместо 58x58;
- текстовому блоку NEXUS/MINECRAFT задана минимальная ширина и Expanding policy;
- убран лишний stretch после текстового блока, который мог сжимать QLabel;
- добавлен финальный QSS override `SIDEBAR_LOGO_SAFE_STYLE`;
- уменьшен `letter-spacing` у NEXUS до безопасного значения.

Файлы:
- ui/components/sidebar.py
- ui/styles.py
