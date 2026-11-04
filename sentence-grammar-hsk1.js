/* Базовые конструкции HSK 1 (HSK 2.0, начальный курс).
 * Это проверяемое подмножество, а не полный перечень грамматики экзамена.
 * slots: группы слов из sentence-lexicon.js; requires: обязательные словарные слова.
 * answers: допустимые порядки слов; mistakes: только однозначные известные ошибки.
 * Расширяйте варианты после проверки преподавателем. JS-файл работает и через file://.
 */
'use strict';
window.SENTENCE_GRAMMAR_HSK1 = {
  level: 'HSK1',
  // Только эти частицы разрешены вне словаря. Глаголы и наречия сюда не добавлять.
  particles: ['的', '吗'],
  constructions: [
    {
      id: 'shi', title: 'Кто кем является: 是',
      slots: { s: 'subjects', n: 'roles' }, requires: ['是'],
      ru: '{s.ru} — {n.ru}.', answers: ['{s.zh}是{n.zh}'],
      explanation: 'Подлежащее + 是 + существительное: кто кем является.',
      mistakes: [{ pattern: '{s.zh}{n.zh}', message: 'Между подлежащим и профессией нужна связка 是.' }]
    },
    {
      id: 'not-shi', title: 'Отрицание: 不是',
      slots: { s: 'subjects', n: 'roles' }, requires: ['不', '是'],
      ru: '{s.ru} не {n.ru}.', answers: ['{s.zh}不是{n.zh}'],
      explanation: 'Отрицание 不 ставится перед 是: 不是.',
      mistakes: [{ pattern: '{s.zh}是不{n.zh}', message: 'Поставьте 不 перед 是: 不是.' }]
    },
    {
      id: 'shi-question', title: 'Общий вопрос: 吗',
      slots: { s: 'subjects', n: 'roles' }, requires: ['是'],
      ru: '{s.ru} — {n.ru}?',
      answers: ['{s.zh}是{n.zh}吗', '{s.zh}是不是{n.zh}'],
      explanation: 'Общий вопрос: утверждение + 吗. Также допустим вопрос с 是不是.',
      mistakes: [{ pattern: '{s.zh}是{n.zh}', message: 'Получилось утверждение. Для вопроса добавьте 吗 в конце.' }]
    },
    {
      id: 'name', title: 'Имя: 叫',
      slots: { s: 'pronouns', n: 'names' }, requires: ['叫'],
      ru: '{s.called} зовут {n.ru}.', answers: ['{s.zh}叫{n.zh}'],
      explanation: 'Подлежащее + 叫 + имя. В китайском: «Я называюсь…».',
      mistakes: [{ pattern: '{s.zh}是叫{n.zh}', message: 'Перед 叫 связка 是 не нужна.' }]
    },
    {
      id: 'whose', title: 'Принадлежность: 的',
      slots: { o: 'owners', n: 'possessions' }, requires: ['这', '是'],
      ru: 'Это {n.owned}.', answers: ['这是{o.zh}的{n.zh}'],
      explanation: 'Владелец + 的 + предмет: 我的书 — моя книга.',
      mistakes: [{ pattern: '这是{o.zh}{n.zh}', message: 'Для принадлежности предмета используйте 的 после владельца.' }]
    },
    {
      id: 'action', title: 'Действие: подлежащее + глагол + дополнение',
      slots: { s: 'subjects', a: 'actions' }, requires: [],
      ru: '{s.ru} {a.present}.', answers: ['{s.zh}{a.zh}'],
      explanation: 'Сначала подлежащее, затем глагол и его дополнение.'
    },
    {
      id: 'negative-action', title: 'Отрицание действия: 不',
      slots: { s: 'subjects', a: 'actions' }, requires: ['不'],
      ru: '{s.ru} не {a.present}.', answers: ['{s.zh}不{a.zh}'],
      explanation: 'Для отрицания обычного действия 不 ставится перед глаголом.',
      mistakes: [{ pattern: '{s.zh}{a.zh}不', message: 'Отрицание 不 нужно поставить перед глаголом.' }]
    },
    {
      id: 'want', title: 'Желание: 想 + действие',
      slots: { s: 'subjects', a: 'actions' }, requires: ['想'],
      ru: '{s.ru} {s.want} {a.inf}.', answers: ['{s.zh}想{a.zh}'],
      explanation: 'Подлежащее + 想 + глагол: желание совершить действие.',
      mistakes: [{ pattern: '{s.zh}是想{a.zh}', message: 'В этой конструкции перед 想 не нужна связка 是.' }]
    },
    {
      id: 'ability', title: 'Умение: 会 + действие',
      slots: { s: 'subjects', a: 'skills' }, requires: ['会'],
      ru: '{s.ru} {s.can} {a.inf}.', answers: ['{s.zh}会{a.zh}'],
      explanation: '会 перед действием обозначает приобретенное умение.'
    },
    {
      id: 'time', title: 'Время перед действием',
      slots: { s: 'subjects', t: 'times', a: 'actions' }, requires: [],
      ru: '{s.ru} {t.ru} {a.present}.',
      answers: ['{s.zh}{t.zh}{a.zh}', '{t.zh}{s.zh}{a.zh}'],
      explanation: 'Время ставится перед сказуемым: после подлежащего или в начале предложения.',
      mistakes: [{ pattern: '{s.zh}{a.zh}{t.zh}', message: 'Перенесите время перед глаголом или в начало предложения.' }]
    },
    {
      id: 'have', title: 'Наличие: 有',
      slots: { s: 'pronouns', n: 'possessions' }, requires: ['有'],
      ru: 'У {s.gen} есть {n.ru}.', answers: ['{s.zh}有{n.zh}'],
      explanation: 'Подлежащее + 有 + предмет: у кого что есть.',
      mistakes: [{ pattern: '{s.zh}是有{n.zh}', message: 'Перед 有 в этом предложении не нужна связка 是.' }]
    },
    {
      id: 'count-books', title: 'Количество: число + 本 + 书',
      slots: { s: 'pronouns', n: 'bookCounts' }, requires: ['有', '本', '书'],
      ru: 'У {s.gen} есть {n.ru}.', answers: ['{s.zh}有{n.zh}本书'],
      explanation: 'Между числом и 书 нужно счетное слово 本. Перед 本 для двух используется 两.',
      mistakes: [
        { pattern: '{s.zh}有{n.zh}书', message: 'Между числом и 书 нужно счетное слово 本.' },
        { pattern: '{s.zh}有{n.zh}个书', message: 'Для книг используется счетное слово 本.' }
      ]
    }
  ]
};
