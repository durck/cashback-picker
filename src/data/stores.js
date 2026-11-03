// Starter set of popular chains with typical MCC codes. The same chain may use
// a different MCC at some locations, so every entry is marked as approximate.
export const APPROX_NOTE = 'ориентировочно';

const store = (id, name, mcc, aliases = []) => ({
  id, name, aliases, mcc, note: APPROX_NOTE, usedCount: 0, lastUsedAt: null,
});

export const DEFAULT_STORES = Object.freeze([
  // Groceries
  store('pyaterochka', 'Пятёрочка', 5411, ['пятерка', '5ка', 'pyaterochka']),
  store('magnit', 'Магнит', 5411, ['magnit']),
  store('perekrestok', 'Перекрёсток', 5411, ['перек', 'perekrestok']),
  store('vkusvill', 'ВкусВилл', 5411, ['вкус вилл', 'vkusvill']),
  store('lenta', 'Лента', 5411, ['lenta']),
  store('auchan', 'Ашан', 5411, ['auchan']),
  store('dixy', 'Дикси', 5411, ['dixy']),
  store('azbuka', 'Азбука вкуса', 5411, ['азбука']),
  store('okey', 'О’КЕЙ', 5411, ['окей', 'okey']),
  store('verny', 'Верный', 5411),
  store('globus', 'Глобус', 5411, ['globus']),
  store('metro-cc', 'METRO Cash & Carry', 5411, ['метро кэш', 'metro']),
  store('samokat', 'Самокат', 5411, ['samokat']),
  store('lavka', 'Яндекс Лавка', 5411, ['лавка']),
  store('fixprice', 'Fix Price', 5331, ['фикс прайс', 'фикс']),
  // Fuel
  store('lukoil', 'Лукойл', 5541, ['lukoil']),
  store('rosneft', 'Роснефть', 5541, ['rosneft']),
  store('gazpromneft', 'Газпромнефть', 5541, ['газпром', 'гпн']),
  store('tatneft', 'Татнефть', 5541),
  store('teboil', 'Teboil', 5541, ['тебойл']),
  // Pharmacies
  store('apteka366', 'Аптека 36,6', 5912, ['36,6', '366']),
  store('rigla', 'Ригла', 5912),
  store('gorzdrav', 'Горздрав', 5912),
  store('aprel', 'Аптека Апрель', 5912, ['апрель']),
  store('eapteka', 'ЕАПТЕКА', 5912, ['еаптека', 'eapteka']),
  // Fast food and coffee
  store('vkusno', 'Вкусно — и точка', 5814, ['макдоналдс', 'макдональдс', 'mcdonalds']),
  store('rostics', 'Rostic’s', 5814, ['ростикс', 'kfc', 'кфс']),
  store('burger-king', 'Бургер Кинг', 5814, ['burger king', 'бк']),
  store('dodo', 'Додо Пицца', 5814, ['додо', 'dodo']),
  store('teremok', 'Теремок', 5814),
  store('cofix', 'Cofix', 5814, ['кофикс']),
  store('stars-coffee', 'Stars Coffee', 5814, ['старс', 'старбакс', 'starbucks']),
  store('shokoladnitsa', 'Шоколадница', 5812),
  // Transport
  store('yandex-go', 'Яндекс Go', 4121, ['яндекс такси', 'такси', 'yandex go']),
  store('troika', 'Метро (Тройка)', 4111, ['тройка', 'метро', 'подорожник']),
  store('rzd', 'РЖД', 4112, ['rzd', 'поезд', 'электричка']),
  store('aeroflot', 'Аэрофлот', 3011, ['aeroflot']),
  store('pobeda', 'Победа', 4511, ['pobeda']),
  // Electronics
  store('mvideo', 'М.Видео', 5732, ['мвидео', 'mvideo']),
  store('eldorado', 'Эльдорадо', 5732, ['eldorado']),
  store('dns', 'DNS', 5732, ['днс']),
  store('citilink', 'Ситилинк', 5732, ['citilink']),
  // Marketplaces
  store('ozon', 'Ozon', 5399, ['озон']),
  store('wildberries', 'Wildberries', 5399, ['вайлдберриз', 'вб', 'wb']),
  store('yandex-market', 'Яндекс Маркет', 5399, ['маркет']),
  // Clothes and sport
  store('sportmaster', 'Спортмастер', 5941, ['sportmaster']),
  store('gloria-jeans', 'Gloria Jeans', 5651, ['глория джинс']),
  store('ostin', 'O’STIN', 5651, ['остин', 'ostin']),
  store('lamoda', 'Lamoda', 5651, ['ламода']),
  // Home
  store('lemana', 'Лемана ПРО', 5200, ['леруа мерлен', 'леруа', 'leroy merlin']),
  store('obi', 'OBI', 5200, ['оби']),
  store('petrovich', 'Петрович', 5211),
  store('hoff', 'Hoff', 5712, ['хофф']),
  // Beauty
  store('letoile', 'Л’Этуаль', 5977, ['летуаль', 'letoile']),
  store('goldapple', 'Золотое яблоко', 5977, ['золотое', 'goldapple']),
  store('podruzhka', 'Подружка', 5977),
  // Other
  store('chetyre-lapy', 'Четыре лапы', 5995, ['4 лапы']),
  store('chitai-gorod', 'Читай-город', 5942),
  store('detsky-mir', 'Детский мир', 5641),
  store('mts', 'МТС', 4814, ['mts']),
  store('beeline', 'Билайн', 4814, ['beeline']),
  store('megafon', 'МегаФон', 4814, ['megafon']),
  store('t2', 'T2', 4814, ['теле2', 'tele2', 'т2']),
  store('cinema-park', 'Синема Парк', 7832, ['формула кино', 'cinema park']),
]);
