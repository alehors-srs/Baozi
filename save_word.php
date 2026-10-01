<?php
/**
 * save_word.php — добавляет новое слово в words.js на сервере.
 * Принимает POST: char, pinyin, translation
 * Дописывает слово в массив dictionary внутри words.js
 */

header('Content-Type: text/plain; charset=utf-8');

// Разрешённые методы: GET и POST
$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'POST' && $method !== 'GET') {
    http_response_code(405);
    echo 'ERROR: Method not allowed';
    exit;
}

// Получаем данные (поддерживаем GET и POST)
$char = trim(($method === 'POST' ? $_POST['char'] : $_GET['char']) ?? '');
$pinyin = trim(($method === 'POST' ? $_POST['pinyin'] : $_GET['pinyin']) ?? '');
$translation = trim(($method === 'POST' ? $_POST['translation'] : $_GET['translation']) ?? '');

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
    echo 'ERROR: words.js not found';
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
        echo 'OK: Word already exists';
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
    echo 'ERROR: Cannot parse words.js structure';
    exit;
}

// Записываем обновлённый файл
$result = file_put_contents($wordsFile, $newContent);
if ($result === false) {
    http_response_code(500);
    echo 'ERROR: Cannot write words.js';
    exit;
}

echo 'OK';
