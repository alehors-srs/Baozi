<?php
error_reporting(E_ALL);
ini_set('display_errors', 0); // Don't show errors in output, only in JSON
/**
 * save_word.php — добавляет новое слово в words.js на сервере.
 * Принимает POST: char, pinyin, translation
 * Дописывает слово в массив dictionary внутри words.js
 */

header('Content-Type: application/json; charset=utf-8');

// Разрешённые методы
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);
    exit;
}

// Получаем данные
$char = trim($_POST['char'] ?? '');
$pinyin = trim($_POST['pinyin'] ?? '');
$translation = trim($_POST['translation'] ?? '');

if ($char === '' || $pinyin === '' || $translation === '') {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Missing fields']);
    exit;
}

// Защита от инъекций: только базовая очистка
$char = htmlspecialchars($char, ENT_QUOTES, 'UTF-8');
$pinyin = htmlspecialchars($pinyin, ENT_QUOTES, 'UTF-8');
$translation = htmlspecialchars($translation, ENT_QUOTES, 'UTF-8');

$wordsFile = __DIR__ . '/words.js';

if (!file_exists($wordsFile)) {
    http_response_code(404);
    echo json_encode(['status' => 'error', 'message' => 'words.js not found']);
    exit;
}

// Читаем текущий words.js
$current = file_get_contents($wordsFile);
if ($current === false) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Cannot read words.js']);
    exit;
}

// Формируем новую запись для JS-массива
$newEntry = "  {char: "" . $char . "", pinyin: "" . $pinyin . "", translation: "" . $translation . ""}";

// Стратегия: находим последнюю запись вида } ] или }] перед закрывающей частью
// и вставляем перед закрывающей скобкой массива
// words.js обычно выглядит как: window.dictionary = [ ... ];
// или: dictionary = [ ... ];

// Проверяем, есть ли уже слово с таким иероглифом
if (strpos($current, $char) !== false) {
    // Точнее — ищем {char: "ИЕРОГЛИФ"
    $pattern = '/\{\s*char\s*:\s*["\']' . preg_quote($char, '/') . '["\']/u';
    if (preg_match($pattern, $current)) {
        echo json_encode(['status' => 'exists', 'message' => 'Word already exists']);
        exit;
    }
}

// Ищем позицию закрывающей скобки массива ]
// Поддерживаем форматы:
//   window.dictionary = [ ... ];
//   dictionary = [ ... ];

// Находим последний ] перед );
 или ; в конце файла
if (preg_match('/(.*)\]\s*\)\s*;\s*$/s', $current, $matches)) {
    // Формат: ...]; (с круглой скобкой)
    $beforeBracket = $matches[1];
    $afterBracket = ']' . substr($current, strlen($beforeBracket) + 1);
    
    // Проверяем, нужна ли запятая перед новой записью
    $trimmedBefore = rtrim($beforeBracket);
    $needsComma = '';
    if (strlen($trimmedBefore) > 0 && substr($trimmedBefore, -1) !== '[' && substr($trimmedBefore, -1) !== ',') {
        $needsComma = ',';
    }
    
    // Сохраняем оригинальные пробелы/переносы перед ]
    $removedPart = substr($beforeBracket, strlen($trimmedBefore));
    
    $newContent = $trimmedBefore . $needsComma . "\n" . $newEntry . $removedPart . $afterBracket;
} elseif (preg_match('/(.*)\]\s*;\s*$/s', $current, $matches)) {
    // Формат: ...];
    $beforeBracket = $matches[1];
    $afterBracket = ']' . substr($current, strlen($beforeBracket) + 1);
    
    $trimmedBefore = rtrim($beforeBracket);
    $needsComma = '';
    if (strlen($trimmedBefore) > 0 && substr($trimmedBefore, -1) !== '[' && substr($trimmedBefore, -1) !== ',') {
        $needsComma = ',';
    }
    
    $removedPart = substr($beforeBracket, strlen($trimmedBefore));
    
    $newContent = $trimmedBefore . $needsComma . "\n" . $newEntry . $removedPart . $afterBracket;
} else {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Cannot parse words.js structure']);
    exit;
}

// Проверяем права на запись перед записью
if (!is_writable($wordsFile)) {
    echo json_encode(['status' => 'error', 'message' => 'words.js is not writable. Current permissions: ' . substr(sprintf('%o', fileperms($wordsFile)), -4)]);
    exit;
}

// Записываем обновлённый файл
$result = file_put_contents($wordsFile, $newContent, LOCK_EX);
if ($result === false) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Cannot write words.js — check file permissions']);
    exit;
}

echo json_encode(['status' => 'saved', 'message' => 'Word saved successfully']);
