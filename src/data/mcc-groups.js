// Preset MCC groups used to build monthly categories. A code is either a
// number or an inclusive [from, to] range (airlines, hotels, car rental).
export const DEFAULT_MCC_GROUPS = Object.freeze([
  { id: 'supermarkets', name: 'Супермаркеты', codes: [5411, 5422, 5441, 5451, 5462, 5499] },
  { id: 'fuel', name: 'АЗС', codes: [5541, 5542, 5552, 5983] },
  { id: 'pharmacy', name: 'Аптеки', codes: [5122, 5912] },
  { id: 'restaurants', name: 'Рестораны и кафе', codes: [5811, 5812, 5813] },
  { id: 'fastfood', name: 'Фастфуд', codes: [5814] },
  { id: 'taxi', name: 'Такси', codes: [4121] },
  { id: 'transport', name: 'Общественный транспорт', codes: [4111, 4131] },
  { id: 'rail', name: 'Ж/д билеты', codes: [4112] },
  { id: 'airlines', name: 'Авиабилеты', codes: [[3000, 3350], 4511] },
  { id: 'hotels', name: 'Отели', codes: [[3501, 3999], 7011] },
  { id: 'car-rental', name: 'Аренда авто', codes: [[3351, 3500], 7512] },
  {
    id: 'clothes', name: 'Одежда и обувь',
    codes: [5611, 5621, 5631, 5641, 5651, 5661, 5691, 5699],
  },
  { id: 'electronics', name: 'Электроника и техника', codes: [5045, 5722, 5732, 5734] },
  {
    id: 'home', name: 'Дом и ремонт',
    codes: [5200, 5211, 5231, 5251, 5261, 5712, 5713, 5714, 5719],
  },
  { id: 'beauty', name: 'Красота', codes: [5977, 7230, 7297, 7298] },
  { id: 'sport', name: 'Спорт', codes: [5655, 5940, 5941, 7941, 7997] },
  { id: 'entertainment', name: 'Развлечения', codes: [7832, 7922, 7991, 7996, 7999] },
  { id: 'cinema', name: 'Кино', codes: [7832] },
  { id: 'books', name: 'Книги', codes: [5192, 5942, 5994] },
  { id: 'pets', name: 'Животные', codes: [742, 5995] },
  { id: 'telecom', name: 'Связь', codes: [4812, 4814, 4899] },
  {
    id: 'marketplaces', name: 'Универмаги и маркетплейсы',
    codes: [5300, 5310, 5311, 5331, 5399],
  },
  {
    id: 'medicine', name: 'Медицина',
    codes: [8011, 8021, 8031, 8041, 8042, 8043, 8049, 8050, 8062, 8071, 8099],
  },
  { id: 'education', name: 'Образование', codes: [8211, 8220, 8241, 8244, 8249, 8299] },
  { id: 'flowers', name: 'Цветы', codes: [5193, 5992] },
  {
    id: 'auto', name: 'Автоуслуги',
    codes: [5531, 5532, 5533, 7531, 7534, 7535, 7538, 7542, 7549],
  },
  { id: 'kids', name: 'Детские товары', codes: [5641, 5945] },
  { id: 'utilities', name: 'ЖКХ', codes: [4900] },
]);
