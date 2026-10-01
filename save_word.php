<?php
/**
 * save_word.php — добавляет новое слово в words.js на сервере.
 * Принимает POST: char, pinyin, translation
 * Дописывает слово в массив dictionary внутри words.js
 */

header('Content-Type: text/plain; charset=utf-8');

// Разрешённые методы
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo 'ERROR: Method not allowed';
    exit;
}

// Получаем данные
$char = trim($_POST['char'] ?? '');
$pinyin = trim($_POST['pinyin'] ?? '');
$translation = trim($_POST['translation'] ?? '');

if ($char === '' || $pinyin === '' || $translation === '') {
    http_response_code(400);
    echo 'ERROR: Missing fields';
    exit;
}

// Защита от инъекций: только базовая очистка
$char = htmlspecialchars($char, ENT_QUOTES, 'UTF-8');
$pinyin = htmlspecialchars($pinyin, ENT_QUOTES, 'UTF-8');
$translation = htmlspecialchars($translation, ENT_QUOTES, 'UTF-8');

$wordsFile = __DIR__ . '/words.js';

if (!file_exists($wordsFile)) {
    http_response_code(404);
    echo 'ERROR: words.js not found at ' . $wordsFile;
    exit;
}

// Читаем текущий words.js
$current = file_get_contents($wordsFile);
if ($current === false) {
    http_response_code(500);
    echo 'ERROR: Cannot read words.js';
    exit;
}

// Формируем новую запись для JS-массива
$newEntry = "  {char: \"" . $char . "\", pinyin: \"" . $pinyin . "\", translation: \"" . $translation . "\"}";

// Проверяем, есть ли уже слово с таким иероглифом
$pattern = '/\{\s*char\s*:\s*["\']' . preg_quote($char, '/') . '["\']/u';
if (preg_match($pattern, $current)) {
    echo 'OK: Word already exists';
    exit;
}

// Ищем последнюю закрывающую скобку массива ]
// Поддерживаем разные форматы:
//   window.dictionary = [ ... ];
//   dictionary = [ ... ];
//   var dictionary = [ ... ];

// Стратегия: находим последний ] в файле и вставляем перед ним
$lastBracket = strrpos($current, ']');
if ($lastBracket === false) {
    http_response_code(500);
    echo 'ERROR: Cannot find closing bracket in words.js';
    exit;
}

$beforeBracket = substr($current, 0, $lastBracket);
$afterBracket = substr($current, $lastBracket);

// Проверяем, нужна ли запятая перед новой записью
$trimmedBefore = rtrim($beforeBracket);
$needsComma = '';
if (strlen($trimmedBefore) > 0 && substr($trimmedBefore, -1) !== '[' && substr($trimmedBefore, -1) !== ',') {
    $needsComma = ',';
}

// Сохраняем оригинальные пробелы/переносы перед ]
$removedPart = substr($beforeBracket, strlen($trimmedBefore));

$newContent = $trimmedBefore . $needsComma . "\n" . $newEntry . $removedPart . $afterBracket;

// Записываем обновлённый файл
$result = file_put_contents($wordsFile, $newContent);
if ($result === false) {
    http_response_code(500);
    echo 'ERROR: Cannot write words.js';
    exit;
}

echo 'OK';
