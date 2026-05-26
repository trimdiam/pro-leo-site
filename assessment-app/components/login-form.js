import { login, logout, getCurrentUser } from '../services/auth-service.js';

export function createLoginForm({ onLogin = () => {}, onLogout = () => {}, onGenerateDemo = () => {}, onClearDemo = () => {}, onGenerateWeeklyMathDemo = () => {} } = {}) {
  const user = getCurrentUser();

  if (user) {
    const panel = document.createElement('div');
    panel.className = 'panel user-panel';

    const info = document.createElement('div');
    info.className = 'user-info';
    info.innerHTML = `<strong>${user.name}</strong> <span class="role-badge role-${user.role}">${user.role}</span>`;

    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'btn btn-secondary btn-sm';
    logoutBtn.textContent = 'Logout';
    logoutBtn.addEventListener('click', () => {
      logout();
      onLogout();
    });

    panel.append(info, logoutBtn);
    return panel;
  }

  const container = document.createElement('div');

  const form = document.createElement('form');
  form.className = 'panel login-form';

  const heading = document.createElement('h2');
  heading.className = 'section-heading';
  heading.textContent = 'Login';
  form.append(heading);

  const emailField = document.createElement('div');
  emailField.className = 'field';
  const emailLabel = document.createElement('label');
  emailLabel.textContent = 'Login ID';
  const emailInput = document.createElement('input');
  emailInput.type = 'text';
  emailInput.className = 'text-input';
  emailInput.placeholder = 'Staff ID (e.g. SFST001) or admin email';
  emailInput.required = true;
  emailField.append(emailLabel, emailInput);
  form.append(emailField);

  const passwordField = document.createElement('div');
  passwordField.className = 'field';
  const passwordLabel = document.createElement('label');
  passwordLabel.textContent = 'Password';
  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.className = 'text-input';
  passwordInput.placeholder = '••••••';
  passwordInput.required = true;
  passwordField.append(passwordLabel, passwordInput);
  form.append(passwordField);

  const hint = document.createElement('p');
  hint.className = 'empty-state';
  hint.style.fontSize = '0.85rem';
  hint.innerHTML = `Teachers: enter your Staff ID (e.g. <strong>SFST001</strong>)<br>Admin: enter your email (e.g. <strong>admin@test.com</strong>)`;
  form.append(hint);

  const errorEl = document.createElement('p');
  errorEl.className = 'error-state';
  errorEl.style.display = 'none';
  form.append(errorEl);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn btn-primary';
  submitBtn.textContent = 'Login';
  form.append(submitBtn);

  async function attemptLogin(id, pw) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in…';
    errorEl.style.display = 'none';
    try {
      const user = await login(id, pw);
      onLogin(user);
    } catch (err) {
      if (err.code === 'auth/quota-exceeded' || err.code === 'auth/too-many-requests') {
        // Auto-retry after 90s with countdown
        let secs = 90;
        errorEl.textContent = `${err.message} Retrying in ${secs}s…`;
        errorEl.style.display = 'block';
        const tick = setInterval(() => {
          secs--;
          if (secs <= 0) {
            clearInterval(tick);
            errorEl.style.display = 'none';
            attemptLogin(id, pw);
          } else {
            errorEl.textContent = `${err.message} Retrying in ${secs}s…`;
          }
        }, 1000);
      } else {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
      }
    }
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    attemptLogin(emailInput.value.trim(), passwordInput.value.trim());
  });

  container.append(form);

  const demoPanel = document.createElement('div');
  demoPanel.className = 'panel';
  demoPanel.style.marginTop = '14px';

  const demoHeading = document.createElement('h3');
  demoHeading.className = 'sub-heading';
  demoHeading.textContent = 'Demo Data';
  demoPanel.append(demoHeading);

  const demoInfo = document.createElement('p');
  demoInfo.className = 'empty-state';
  demoInfo.style.fontSize = '0.85rem';
  demoInfo.textContent = 'Generate realistic assessment data for May 2026 across all subjects for Class I & II.';
  demoPanel.append(demoInfo);

  const genBtn = document.createElement('button');
  genBtn.type = 'button';
  genBtn.className = 'btn btn-primary';
  genBtn.textContent = 'Load Demo Data';
  genBtn.addEventListener('click', async () => {
    genBtn.disabled = true;
    genBtn.textContent = 'Building profiles…';
    try {
      const count = await onGenerateDemo();
      alert(`${count} demo sessions generated. Student profiles updated.`);
    } finally {
      genBtn.disabled = false;
      genBtn.textContent = 'Load Demo Data';
    }
  });

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn btn-secondary';
  clearBtn.textContent = 'Clear Demo Data';
  clearBtn.addEventListener('click', () => {
    onClearDemo();
    alert('Demo data cleared.');
  });

  const demoActions = document.createElement('div');
  demoActions.className = 'action-area';
  demoActions.style.justifyContent = 'flex-start';
  demoActions.append(genBtn, clearBtn);
  demoPanel.append(demoActions);

  const weeklyDivider = document.createElement('hr');
  weeklyDivider.style.margin = '12px 0';
  demoPanel.append(weeklyDivider);

  const weeklyInfo = document.createElement('p');
  weeklyInfo.className = 'empty-state';
  weeklyInfo.style.fontSize = '0.85rem';
  weeklyInfo.textContent = '4-week Maths demo for Class I — shows locked, overdue, and in-progress weekly sessions with a rising performance trend.';
  demoPanel.append(weeklyInfo);

  const weeklyBtn = document.createElement('button');
  weeklyBtn.type = 'button';
  weeklyBtn.className = 'btn btn-primary';
  weeklyBtn.textContent = 'Load Weekly Maths Demo';
  weeklyBtn.addEventListener('click', async () => {
    weeklyBtn.disabled = true;
    weeklyBtn.textContent = 'Building profiles…';
    try {
      await onGenerateWeeklyMathDemo();
    } finally {
      weeklyBtn.disabled = false;
      weeklyBtn.textContent = 'Load Weekly Maths Demo';
    }
  });
  demoPanel.append(weeklyBtn);

  container.append(demoPanel);

  return container;
}
