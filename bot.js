require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const { Telegraf, Markup } = require('telegraf');

const app = express();

// ЄДИНИЙ ПОРТ ДЛЯ СЕРВЕРА ТА КЛІЄНТА
const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = path.join(__dirname, 'balances.json');

// Завантаження / збереження балансів у локальний JSON-файл
function loadBalances() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify({}, null, 2));
    }
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveBalances(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Підключені браузери для оновлення в реальному часі (SSE)
const sseClients = new Set();

function broadcastBalance(username, balance, event = null) {
  const payload = JSON.stringify({ username, balance, event });
  for (const res of sseClients) {
    res.write(`data: ${payload}\n\n`);
  }
}

// Дозволяємо запити з інших локальних портів (наприклад, Live Server) та віддаємо статику
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.static(__dirname));

// Синхронізація порту та базової адреси API для фронтенду
app.get('/api/config', (req, res) => {
  res.json({
    port: PORT,
    baseUrl: `http://localhost:${PORT}`
  });
});

// Потік подій у реальному часі для сторінки
app.get('/api/stream', (req, res) => {
  const username = String(req.query.username || '').trim();
  if (!username) {
    return res.status(400).end();
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const balances = loadBalances();
  const currentBalance = Number(balances[username] || 0);
  res.write(`data: ${JSON.stringify({ username, balance: currentBalance, event: null })}\n\n`);

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// Оновлення балансу зі сторінки (покупка нагороди або скидання)
app.post('/api/balance', express.json(), (req, res) => {
  const { username, balance } = req.body || {};
  if (!username || typeof balance !== 'number') {
    return res.status(400).json({ ok: false });
  }
  const balances = loadBalances();
  balances[username] = Math.max(0, Math.floor(balance));
  saveBalances(balances);
  broadcastBalance(username, balances[username], null);
  res.json({ ok: true, balance: balances[username] });
});

// --- Telegram-бот ---
const BOT_TOKEN = process.env.BOT_TOKEN || '9261684731:AAFGgpm8ZEwFlaa-p8wG8ctHpxtvpEwRFsg';
const ADMIN_IDS = [Number(process.env.ADMIN_TG_ID) || 2122371486];
const QUICK_USERS = ['Diana_Oleksynn'];

const bot = new Telegraf(BOT_TOKEN);
const userState = new Map();

function isAdmin(ctx) {
  return ADMIN_IDS.includes(ctx.from?.id);
}

function getMainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('➕ Нарахувати ангороди', 'action:add')],
    [Markup.button.callback('➖ Списати ангороди', 'action:sub')],
    [Markup.button.callback('🎯 Встановити баланс', 'action:set')],
    [Markup.button.callback('📊 Перевірити баланс', 'action:bal')]
  ]);
}

function getUsersMenu(action) {
  const rows = QUICK_USERS.map((u) => [Markup.button.callback(`👤 ${u}`, `user:${action}:${u}`)]);
  rows.push([Markup.button.callback('✍️ Ввести інший нікнейм', `manual_user:${action}`)]);
  rows.push([Markup.button.callback('⬅️ Назад', 'menu:main')]);
  return Markup.inlineKeyboard(rows);
}

function getAmountsMenu(action, username) {
  const sign = action === 'sub' ? '-' : action === 'add' ? '+' : '';
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(`${sign}100 🪙`, `amount:${action}:${username}:100`),
      Markup.button.callback(`${sign}500 🪙`, `amount:${action}:${username}:500`),
      Markup.button.callback(`${sign}1000 🪙`, `amount:${action}:${username}:1000`)
    ],
    [Markup.button.callback('✍️ Своя сума', `manual_amount:${action}:${username}`)],
    [Markup.button.callback('⬅️ Назад', 'menu:main')]
  ]);
}

function applyOperation(action, username, amount) {
  const balances = loadBalances();
  let current = Number(balances[username] || 0);

  if (action === 'bal') {
    return current;
  }
  if (action === 'add') {
    current += amount;
  } else if (action === 'sub') {
    current = Math.max(0, current - amount);
  } else if (action === 'set') {
    current = Math.max(0, amount);
  }

  balances[username] = current;
  saveBalances(balances);
  broadcastBalance(username, current, { type: action, amount });
  return current;
}

bot.start((ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('⛔ Доступ обмежено.');
  userState.delete(ctx.from.id);
  return ctx.reply('🪙 *Меню керування ангородами*\nОбери дію:', {
    parse_mode: 'Markdown',
    ...getMainMenu()
  });
});

bot.action('menu:main', async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();
  userState.delete(ctx.from.id);
  return ctx.editMessageText('🪙 *Меню керування ангородами*\nОбери дію:', {
    parse_mode: 'Markdown',
    ...getMainMenu()
  });
});

bot.action(/^action:(add|sub|set|bal)$/, async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();
  const action = ctx.match[1];
  return ctx.editMessageText('Обери акаунт або введи нікнейм вручну:', {
    ...getUsersMenu(action)
  });
});

bot.action(/^user:(add|sub|set|bal):(.+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();
  const [, action, username] = ctx.match;

  if (action === 'bal') {
    const bal = applyOperation('bal', username, 0);
    return ctx.editMessageText(`📊 Баланс *${username}*: *${bal} 🪙*`, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Меню', 'menu:main')]])
    });
  }

  return ctx.editMessageText(`👤 Акаунт: *${username}*\nОбери суму:`, {
    parse_mode: 'Markdown',
    ...getAmountsMenu(action, username)
  });
});

bot.action(/^manual_user:(add|sub|set|bal)$/, async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();
  userState.set(ctx.from.id, { step: 'username', action: ctx.match[1] });
  return ctx.editMessageText('✍️ Напиши нікнейм користувача (як на сайті):');
});

bot.action(/^manual_amount:(add|sub|set):(.+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery();
  const [, action, username] = ctx.match;
  userState.set(ctx.from.id, { step: 'amount', action, username });
  return ctx.editMessageText(`✍️ Введи число для *${username}*:`, { parse_mode: 'Markdown' });
});

bot.action(/^amount:(add|sub|set):(.+):(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return;
  await ctx.answerCbQuery('Готово!');
  const [, action, username, rawNum] = ctx.match;
  const amount = Number(rawNum);
  const newBal = applyOperation(action, username, amount);

  return ctx.editMessageText(`✅ Оновлено! Новий баланс *${username}*: *${newBal} 🪙*`, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('➕ Ще нарахувати', `user:add:${username}`)],
      [Markup.button.callback('⬅️ Меню', 'menu:main')]
    ])
  });
});

bot.on('text', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const state = userState.get(ctx.from.id);
  if (!state) return;

  const text = ctx.message.text.trim();
  if (state.step === 'username') {
    userState.delete(ctx.from.id);
    if (state.action === 'bal') {
      const bal = applyOperation('bal', text, 0);
      return ctx.reply(`📊 Баланс *${text}*: *${bal} 🪙*`, {
        parse_mode: 'Markdown',
        ...getMainMenu()
      });
    }
    return ctx.reply(`👤 Акаунт: *${text}*\nОбери суму:`, {
      parse_mode: 'Markdown',
      ...getAmountsMenu(state.action, text)
    });
  }

  if (state.step === 'amount') {
    const amount = Number(text);
    if (!Number.isFinite(amount) || amount < 0) {
      return ctx.reply('⚠️ Введи коректне число:');
    }
    userState.delete(ctx.from.id);
    const newBal = applyOperation(state.action, state.username, amount);
    return ctx.reply(`✅ Оновлено! Новий баланс *${state.username}*: *${newBal} 🪙*`, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('➕ Ще нарахувати', `user:add:${state.username}`)],
        [Markup.button.callback('⬅️ Меню', 'menu:main')]
      ])
    });
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущено на http://localhost:${PORT}`);
});
bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));