/* Разметка для генератора. Это НЕ дополнительный словарь.
 * Каждая запись доступна лишь при наличии всех requires в словарях сайта.
 * Русские формы заданы явно, чтобы не склонять автоматически имена и слова.
 */
'use strict';
window.SENTENCE_LEXICON = {
  pronouns: [
    { zh: '我', ru: 'Я', person: 'i', called: 'Меня', gen: 'меня', want: 'хочу', can: 'умею' },
    { zh: '你', ru: 'Ты', person: 'you', called: 'Тебя', gen: 'тебя', want: 'хочешь', can: 'умеешь' },
    { zh: '他', ru: 'Он', person: 'third', called: 'Его', gen: 'него', want: 'хочет', can: 'умеет' },
    { zh: '她', ru: 'Она', person: 'third', called: 'Ее', gen: 'нее', want: 'хочет', can: 'умеет' }
  ],
  // Names from names.js become additional subjects at runtime.
  roles: [{ zh: '老师', ru: 'учитель' }, { zh: '学生', ru: 'ученик' }],
  owners: [{ zh: '我', adjective: { f: 'моя', m: 'мой' } }, { zh: '你', adjective: { f: 'твоя', m: 'твой' } }],
  possessions: [{ zh: '书', ru: 'книга', gender: 'f' }, { zh: '电脑', ru: 'компьютер', gender: 'm' }],
  times: [{ zh: '今天', ru: 'сегодня' }, { zh: '明天', ru: 'завтра' }],
  bookCounts: [{ zh: '一', ru: 'одна книга' }, { zh: '两', ru: 'две книги' }, { zh: '三', ru: 'три книги' }],
  actions: [
    { zh: '喝茶', requires: ['喝', '茶'], inf: 'пить чай', present: { i: 'пью чай', you: 'пьешь чай', third: 'пьет чай' } },
    { zh: '喝咖啡', requires: ['喝', '咖啡'], inf: 'пить кофе', present: { i: 'пью кофе', you: 'пьешь кофе', third: 'пьет кофе' } },
    { zh: '吃米饭', requires: ['吃', '米饭'], inf: 'есть рис', present: { i: 'ем рис', you: 'ешь рис', third: 'ест рис' } },
    { zh: '吃饺子', requires: ['吃', '饺子'], inf: 'есть пельмени', present: { i: 'ем пельмени', you: 'ешь пельмени', third: 'ест пельмени' } },
    { zh: '看书', requires: ['看', '书'], inf: 'читать книгу', present: { i: 'читаю книгу', you: 'читаешь книгу', third: 'читает книгу' }, alternatives: [{ zh: '读书', requires: ['读', '书'] }] },
    { zh: '学习汉语', requires: ['学习', '汉语'], inf: 'учить китайский язык', present: { i: 'учу китайский язык', you: 'учишь китайский язык', third: 'учит китайский язык' }, alternatives: [{ zh: '学习中文', requires: ['学习', '中文'] }] },
    { zh: '去学校', requires: ['去', '学校'], inf: 'идти в школу', present: { i: 'иду в школу', you: 'идешь в школу', third: 'идет в школу' } },
    { zh: '去商店', requires: ['去', '商店'], inf: 'идти в магазин', present: { i: 'иду в магазин', you: 'идешь в магазин', third: 'идет в магазин' } }
  ],
  skills: [
    { zh: '说汉语', requires: ['说', '汉语'], inf: 'говорить по-китайски', alternatives: [{ zh: '说中文', requires: ['说', '中文'] }] },
    { zh: '说英语', requires: ['说', '英语'], inf: 'говорить по-английски' },
    { zh: '写汉字', requires: ['写', '汉字'], inf: 'писать китайские иероглифы' }
  ]
};
