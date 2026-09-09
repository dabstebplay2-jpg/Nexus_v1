export default function TabContextMenu({ x, y, tab, onClose, onAction }) {
  if (!tab) return null;

  return (
    <div className="tab-context-menu" style={{ top: y, left: x }} onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => { onAction('reload'); onClose(); }}>Обновить</button>
      <button type="button" onClick={() => { onAction('duplicate'); onClose(); }}>Дублировать</button>
      <button type="button" onClick={() => { onAction('pin', !tab.pinned); onClose(); }}>
        {tab.pinned ? 'Открепить' : 'Закрепить'}
      </button>
      <button type="button" onClick={() => { onAction('mute', !tab.muted); onClose(); }}>
        {tab.muted ? 'Включить звук' : 'Без звука'}
      </button>
      <hr />
      <button type="button" onClick={() => { onAction('newGroup'); onClose(); }}>Новая группа</button>
      {tab.groupId && (
        <button type="button" onClick={() => { onAction('removeFromGroup'); onClose(); }}>Убрать из группы</button>
      )}
      <hr />
      <button type="button" onClick={() => { onAction('close'); onClose(); }}>Закрыть вкладку</button>
      <button type="button" onClick={() => { onAction('closeOthers'); onClose(); }}>Закрыть другие</button>
      <button type="button" onClick={() => { onAction('closeRight'); onClose(); }}>Закрыть справа</button>
    </div>
  );
}
