const HISTORY_KEY = 'angel-hours-history';
const HISTORY_MAX = 8;
const POPULAR = ['1:11', '2:22', '3:33', '4:44', '5:55', '10:10', '11:11', '12:12', '12:21', '12:34', '22:22'];

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Turns "1111", "11:11" or "333" into a validated clock time.
function parseTime(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 3 || digits.length > 4) {
    return { error: 'Enter 3 or 4 digits, like 333 or 11:11.' };
  }
  const hourPart = digits.slice(0, -2);
  const minutePart = digits.slice(-2);
  const hour = Number(hourPart);
  if (hour > 23 || Number(minutePart) > 59) {
    return { error: `${hourPart}:${minutePart} is not a time a clock can show.` };
  }
  // A leading zero is dropped (03:33 reads as 333), except for the midnight hour.
  const hourText = hour === 0 ? '00' : String(hour);
  return { key: hourText + minutePart, display: `${hourText}:${minutePart}` };
}

function detectPattern(key) {
  const d = key.split('').map(Number);
  if (new Set(d).size === 1) return d.length === 3 ? 'triple' : 'quad';
  if (d.length === 4 && key.slice(0, 2) === key.slice(2)) return 'double';
  if (d[0] === d[d.length - 1] && (d.length === 3 || d[1] === d[2])) return 'mirror';
  const steps = d.slice(1).map((n, i) => n - d[i]);
  if (steps.every((s) => s === 1)) return 'ascending';
  if (steps.every((s) => s === -1)) return 'descending';
  return 'personal';
}

function rootNumber(key) {
  let n = key.split('').reduce((sum, c) => sum + Number(c), 0);
  while (n > 9 && n !== 11 && n !== 22) {
    n = String(n).split('').reduce((sum, c) => sum + Number(c), 0);
  }
  return n;
}

// Unique digits in order of appearance, with how often each occurs.
function digitCounts(key) {
  const counts = new Map();
  for (const c of key) counts.set(c, (counts.get(c) || 0) + 1);
  return [...counts].map(([digit, count]) => ({ digit, count }));
}

function joinList(items) {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// Reading for a time with no hand-written entry: root number + digits + pattern.
function composeReading(time, pattern, root, counts) {
  const base = ROOTS[root];
  const blend = joinList(counts.map(({ digit }) => `${digit} (${DIGITS[digit].theme})`));
  const repeated = counts.filter(({ count }) => count > 1);
  const parts = [
    `${time.display} reduces to ${root}, the number of ${base.theme}. ${base.message}`,
    `It blends the energies of ${blend}.`,
  ];
  if (repeated.length) {
    const names = joinList(repeated.map(({ digit }) => digit));
    parts.push(`The repeated ${names} makes that influence stronger.`);
  }
  if (pattern.note) parts.push(pattern.note);

  const byWeight = [...counts].sort((a, b) => b.count - a.count);
  const actions = [pattern.action, base.action, ...byWeight.map(({ digit }) => DIGITS[digit].action)];

  return {
    title: base.theme.replace(/ \(.*\)$/, ''),
    message: parts.join(' '),
    love: base.love,
    career: base.career,
    spirit: base.spirit,
    actions: [...new Set(actions.filter(Boolean))].slice(0, 3),
    affirmation: base.affirmation,
  };
}

function interpret(time) {
  const pattern = PATTERNS[detectPattern(time.key)];
  const root = rootNumber(time.key);
  const counts = digitCounts(time.key);
  const reading = MEANINGS[time.key] || composeReading(time, pattern, root, counts);
  return { time, pattern, root, counts, reading };
}

function renderResult({ time, pattern, root, counts, reading }) {
  const result = $('result');
  result.replaceChildren();

  const head = el('header', 'result-head');
  head.append(el('p', 'badge', pattern.label), el('p', 'big-time', time.display), el('h2', '', reading.title));
  result.append(head, el('p', 'message', reading.message));

  const actions = el('section', 'actions');
  actions.append(el('h3', '', 'What to do now'));
  const steps = el('ol');
  for (const step of reading.actions) steps.append(el('li', '', step));
  actions.append(steps, el('p', 'affirmation', `“${reading.affirmation}”`));
  result.append(actions);

  const areas = el('section', 'areas');
  for (const [name, text] of [['Love', reading.love], ['Career', reading.career], ['Spirit', reading.spirit]]) {
    const card = el('div', 'area');
    card.append(el('h3', '', name), el('p', '', text));
    areas.append(card);
  }
  result.append(areas);

  const breakdown = el('section', 'breakdown');
  breakdown.append(el('h3', '', 'The digits'));
  const list = el('dl');
  for (const { digit, count } of counts) {
    const label = count > 1 ? `${digit} ×${count}` : digit;
    list.append(el('dt', '', label), el('dd', '', `${capitalise(DIGITS[digit].theme)}. ${DIGITS[digit].meaning}`));
  }
  if (ROOTS[root]) {
    list.append(el('dt', 'root', `Root ${root}`), el('dd', '', `${capitalise(ROOTS[root].theme)}, from adding the digits together.`));
  }
  breakdown.append(list);
  result.append(breakdown);

  result.hidden = false;
}

function capitalise(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveHistory(items) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  } catch {
    // Storage is unavailable (private window); history just won't persist.
  }
}

function renderChips(container, times) {
  container.replaceChildren();
  for (const time of times) {
    const chip = el('button', 'chip', time);
    chip.type = 'button';
    chip.addEventListener('click', () => lookUp(time));
    container.append(chip);
  }
}

function renderHistory(items) {
  $('history').hidden = items.length === 0;
  renderChips($('history-chips'), items);
}

// Keeps the field looking like a clock: digits only, colon before the minutes.
function formatInput(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  return digits.length >= 3 ? `${digits.slice(0, -2)}:${digits.slice(-2)}` : digits;
}

function lookUp(raw) {
  const time = parseTime(raw);
  const error = $('error');
  if (time.error) {
    error.textContent = time.error;
    $('result').hidden = true;
    return;
  }
  error.textContent = '';
  $('time').value = time.display;
  renderResult(interpret(time));

  const history = [time.display, ...loadHistory().filter((t) => t !== time.display)].slice(0, HISTORY_MAX);
  saveHistory(history);
  renderHistory(history);
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('time').addEventListener('input', (event) => {
  event.target.value = formatInput(event.target.value);
});

// Selecting on focus lets a new number replace the previous one without deleting it first.
$('time').addEventListener('focus', (event) => {
  event.target.select();
});

$('lookup').addEventListener('submit', (event) => {
  event.preventDefault();
  lookUp($('time').value);
});

$('now').addEventListener('click', () => {
  const now = new Date();
  lookUp(`${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`);
});

$('clear').addEventListener('click', () => {
  saveHistory([]);
  renderHistory([]);
});

renderChips($('popular'), POPULAR);
renderHistory(loadHistory());
