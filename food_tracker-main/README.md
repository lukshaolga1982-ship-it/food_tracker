# Учёт питания — Браславская гимназия

Готовый статический сайт для GitHub Pages + Firebase.

## Что уже реализовано

- Вход по логину и паролю через Firebase Authentication.
- 3 роли: администратор, классный руководитель, ответственный за питание.
- Классный руководитель видит только назначенные классы.
- Учащиеся: ФИО, класс, категория обеда, категория полдника, статус «выбыл».
- 7 категорий обеда:
  - О (1) — за родительскую плату
  - О МН (2) — многодетные
  - О МО (3) — малообеспеченные
  - О УИ (4) — ученик-инвалид
  - О С (5) — Сельские
  - О РИ (6) — родитель-инвалид
  - О СОП (7) — СОП
- 4 категории полдника:
  - П (1)
  - П МН (2)
  - П МО (3)
  - П УИ (4)
- Ежедневные статусы отдельно для обеда и полдника:
  - ✓ питается
  - Н отсутствует
  - – не питается
- По умолчанию учащийся с назначенной категорией считается питающимся.
- Массовые отметки.
- Кнопка «Сведения переданы».
- После нажатия «Сведения переданы» классный руководитель может продолжать исправлять сведения текущего дня до 09:00; кнопка меняется на «Обновить сведения».
- Для классного руководителя редактирование текущего дня блокируется в 09:00 по времени Минска.
- Администратор может исправлять данные после дедлайна.
- Главная страница: всего учащихся, питаются, отсутствуют, не питаются, обеды, полдники.
- Контроль «сколько классов передали сведения».
- Месячная таблица класса.
- Сводная ведомость по каждому классу и каждому дню месяца.
- Экспорт в Excel:
  - сводная за месяц;
  - сводная за день;
  - база учащихся;
  - месячная ведомость класса.
- Импорт учащихся из Excel.
- Управление классами.
- Управление профилями/ролями пользователей.
- Адаптация для компьютеров и телефонов.
- Демо-режим без Firebase: открой `index.html?demo=1` через веб-сервер или GitHub Pages.

---

## 1. Создай/используй Firebase проект

В Firebase Console включи:

### Authentication
Authentication → Sign-in method → **Email/Password** → Enable.

Сайт показывает поле «Логин», но Firebase внутри использует технический email:

`логин@braslav-gym.by`

Например:

- логин `5a_teacher` → `5a_teacher@braslav-gym.by`
- логин `food` → `food@braslav-gym.by`
- логин `admin` → `admin@braslav-gym.by`

Это не настоящий почтовый адрес: он нужен только Firebase Authentication.

### Firestore Database
Создай Cloud Firestore.

---

## 2. Подключи Firebase к сайту

Firebase Console → Project settings → General → Your apps → Web app.

Скопируй Firebase config и вставь его в:

`js/firebase-config.js`

Вместо `PASTE_...`.

---

## 3. Установи Firestore Rules

Вариант A — через Firebase Console:

Firestore Database → Rules → вставь содержимое `firestore.rules` → Publish.

Вариант B — Firebase CLI:

```bash
firebase login
firebase use YOUR_PROJECT_ID
firebase deploy --only firestore:rules,firestore:indexes
```

Важно: в правилах 09:00 Минска соответствует 06:00 UTC, потому что Беларусь использует UTC+3.

---

## 4. Создай первый аккаунт администратора

Firebase Console → Authentication → Users → Add user.

Например:

Email:
`admin@braslav-gym.by`

Password:
твой пароль.

После создания скопируй UID пользователя.

Затем Firestore → Start collection:

Collection ID:
`users`

Document ID:
**UID администратора**

Поля:

```text
username        string    admin
displayName     string    Администратор
role            string    admin
active          boolean   true
classIds        array     []
```

Теперь можно войти на сайт логином `admin`.

---

## 5. Первичная настройка в самом сайте

Войди как администратор → **Настройки**.

Если классов ещё нет, нажми «Создать стандартные классы 5А–11».

Установи:
- учебный год;
- дедлайн 09:00.

---

## 6. Создание остальных пользователей

Из-за безопасности пароли Firebase нельзя создавать обычным клиентским JavaScript от имени администратора.

Поэтому для 13 пользователей самый безопасный и простой вариант:

1. Firebase Console → Authentication → Users → Add user.
2. Создай технический email, например `5a_teacher@braslav-gym.by`, и пароль.
3. Скопируй UID.
4. Сайт → Настройки → Профили пользователей → «+ Профиль».
5. Вставь UID.
6. Выбери роль и доступ к классу.

Пример:

```text
UID:           ...
Логин:         5a_teacher
Имя:           Иванова О.В.
Роль:          Классный руководитель
Доступ:        5А
```

---

## 7. Структура Firestore

Сайт создаёт коллекции:

```text
users
classes
students
dailyRecords
dailySubmissions
settings
auditLog
```

### students

```text
fullName
classId
lunchCategory
snackCategory
status
createdAt
updatedAt
withdrawnAt
```

### dailyRecords

Каждый день хранится снимок категории учащегося, поэтому изменение льготы позже не портит прошлые отчёты.

```text
dateKey
year
month
day
studentId
studentName
classId
lunchCategory
snackCategory
lunchStatus
snackStatus
updatedBy
updatedAt
```

---

## 8. Импорт из Excel

Администратор → Импорт.

Ожидаемые колонки:

```text
ФИО | Класс | Обед | Полдник
```

Можно использовать:
- полное название категории;
- короткое обозначение `О МН (2)`;
- номер категории.

В разделе «Импорт» есть кнопка «Скачать шаблон».

---

## 9. GitHub Pages

1. Создай репозиторий.
2. Загрузи всё содержимое этой папки **в корень репозитория**.
3. GitHub → Settings → Pages.
4. Source: Deploy from a branch.
5. Branch: `main`, Folder: `/ (root)`.
6. Save.

Через несколько минут появится адрес сайта.

Firebase Console → Authentication → Settings → Authorized domains:
добавь домен GitHub Pages, например:

`username.github.io`

---

## Важно о персональных данных

В GitHub не лежат ФИО учащихся, пароли или дневные сведения. Они находятся в Firestore.

Файл `firebase-config.js` не содержит административного секрета. Firebase Web API key не является паролем; доступ к данным ограничивают `firestore.rules`.

Никогда не загружай в GitHub service-account JSON или Firebase Admin private key.
