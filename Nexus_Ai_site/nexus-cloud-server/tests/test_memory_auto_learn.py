from app.services.memory_auto_learn import (
    apply_forget_to_memory,
    merge_memory_content,
    should_forget_from_user_text,
    should_learn_from_user_text,
)


def test_should_learn_triggers():
    assert should_learn_from_user_text("Запомни что меня зовут Добрыня")
    assert should_learn_from_user_text("remember my name is Alex")
    assert not should_learn_from_user_text("Привет, как дела?")


def test_should_forget_triggers():
    assert should_forget_from_user_text("Забудь что меня зовут Добрыня")
    assert should_forget_from_user_text("Удали из памяти про банан")
    assert should_forget_from_user_text("Больше не помни что 1+2=банан")
    assert not should_forget_from_user_text("Не забудь купить молоко")
    assert not should_forget_from_user_text("Запомни моё имя")


def test_forget_does_not_conflict_with_learn():
    assert should_forget_from_user_text("Забудь имя Добрыня")
    assert not should_learn_from_user_text("Забудь имя Добрыня")


def test_merge_memory_dedupes():
    current = "- Пользователя зовут Иван"
    new = "- Пользователя зовут Иван\n- Любит Python"
    merged = merge_memory_content(current, new)
    assert "Иван" in merged
    assert "Python" in merged
    assert merged.count("Иван") == 1


def test_apply_forget_removes_line():
    current = "- Пользователя зовут Добрыня\n- 1 + 2 = Банан"
    spec = "- Пользователя зовут Добрыня"
    result = apply_forget_to_memory(current, spec)
    assert "Добрыня" not in result
    assert "Банан" in result


def test_apply_forget_clear_all():
    assert apply_forget_to_memory("- a\n- b", "CLEAR_ALL") == ""
