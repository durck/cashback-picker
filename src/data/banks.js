// Preset banks. Percentages and limits are placeholders: the user copies real
// values from each bank's app. valueCoef = rubles per 1 reward unit (SPEC §3).
export const DEFAULT_BANKS = Object.freeze([
  {
    id: 'sber', name: 'Сбер', color: '#21a038', order: 1, enabled: true,
    basePercent: 0.5, rewardType: 'points', pointsName: 'Спасибо',
    valueCoef: 0.8, monthlyLimit: null,
  },
  {
    id: 'tbank', name: 'Т-Банк', color: '#ffdd2d', order: 2, enabled: true,
    basePercent: 1, rewardType: 'rub', pointsName: '',
    valueCoef: 1, monthlyLimit: 5000,
  },
  {
    id: 'vtb', name: 'ВТБ', color: '#0a2896', order: 3, enabled: true,
    basePercent: 0, rewardType: 'rub', pointsName: '',
    valueCoef: 1, monthlyLimit: 3000,
  },
  {
    id: 'ozon', name: 'Озон', color: '#005bff', order: 4, enabled: true,
    basePercent: 1, rewardType: 'points', pointsName: 'Ozon-баллы',
    valueCoef: 0.7, monthlyLimit: null,
  },
  {
    id: 'wb', name: 'WB', color: '#cb11ab', order: 5, enabled: true,
    basePercent: 1, rewardType: 'points', pointsName: 'WB-баллы',
    valueCoef: 0.7, monthlyLimit: null,
  },
  {
    id: 'yandex', name: 'Яндекс', color: '#fc3f1d', order: 6, enabled: true,
    basePercent: 1, rewardType: 'points', pointsName: 'Плюс',
    valueCoef: 0.8, monthlyLimit: 3000,
  },
  {
    id: 'alfa', name: 'Альфа', color: '#ef3124', order: 7, enabled: true,
    basePercent: 1, rewardType: 'rub', pointsName: '',
    valueCoef: 1, monthlyLimit: 5000,
  },
]);
