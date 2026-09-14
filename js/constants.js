window.FOOD_APP = window.FOOD_APP || {};

FOOD_APP.LUNCH_CATEGORIES = [
  { code: "O",    number: 1, short: "О (1)",      name: "За родительскую плату" },
  { code: "O_MN", number: 2, short: "О МН (2)",   name: "Многодетные" },
  { code: "O_MO", number: 3, short: "О МО (3)",   name: "Малообеспеченные" },
  { code: "O_UI", number: 4, short: "О УИ (4)",   name: "Ученик-инвалид" },
  { code: "O_S",  number: 5, short: "О С (5)",    name: "Сирота" },
  { code: "O_RI", number: 6, short: "О РИ (6)",   name: "Родитель-инвалид" },
  { code: "O_SOP",number: 7, short: "О СОП (7)",  name: "СОП" }
];

FOOD_APP.SNACK_CATEGORIES = [
  { code: "P",    number: 1, short: "П (1)",      name: "За родительскую плату" },
  { code: "P_MN", number: 2, short: "П МН (2)",   name: "Многодетные" },
  { code: "P_MO", number: 3, short: "П МО (3)",   name: "Малообеспеченные" },
  { code: "P_UI", number: 4, short: "П УИ (4)",   name: "Ученик-инвалид" }
];

FOOD_APP.DEFAULT_CLASSES = [
  { id:"5a", name:"5А", order:51 }, { id:"5b", name:"5Б", order:52 },
  { id:"6a", name:"6А", order:61 }, { id:"6b", name:"6Б", order:62 },
  { id:"7a", name:"7А", order:71 }, { id:"7b", name:"7Б", order:72 },
  { id:"8a", name:"8А", order:81 }, { id:"8b", name:"8Б", order:82 },
  { id:"9", name:"9", order:90 }, { id:"10", name:"10", order:100 },
  { id:"11", name:"11", order:110 }
];

FOOD_APP.ROLE_LABELS = {
  admin: "Администратор",
  teacher: "Классный руководитель",
  food: "Ответственный за питание"
};

FOOD_APP.STATUS_LABELS = {
  eating: "Питается",
  absent: "Отсутствует",
  not_eating: "Не питается",
  none: "Нет питания"
};

FOOD_APP.categoryByCode = function(code){
  return [...FOOD_APP.LUNCH_CATEGORIES, ...FOOD_APP.SNACK_CATEGORIES].find(x => x.code === code) || null;
};
