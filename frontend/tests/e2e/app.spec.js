const path = require('path');
const { test, expect } = require('@playwright/test');

const API_BASE = 'http://127.0.0.1:5000/api';

async function apiLogin(request, username, password = '123') {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await request.post(`${API_BASE}/auth/login`, {
      data: { username, password },
    });
    const payload = await response.json();
    if (response.ok()) {
      return payload.data;
    }
    lastError = new Error(
      `Login failed for ${username}: ${payload?.msg || payload?.message || response.status()}`
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw lastError;
}

async function openAs(page, request, username, password = '123') {
  const session = await apiLogin(request, username, password);
  await page.addInitScript(([token, role]) => {
    localStorage.setItem('token', token);
    localStorage.setItem('role', role);
    sessionStorage.setItem('e2e_allow_auto_login', '1');
  }, [session.token, session.role]);
  await page.goto('/');
  await expect(page.locator('aside')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('main')).toBeVisible({ timeout: 10000 });
  return session;
}

async function waitForMainReady(page) {
  const mainArea = page.locator('main');
  await expect(mainArea).toBeVisible({ timeout: 10000 });
  await expect(mainArea.locator('h1')).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(300);
  return mainArea;
}

async function openCoursesTab(page) {
  const coursesButton = page.getByRole('button', { name: '课程管理' });
  await expect(coursesButton).toBeVisible({ timeout: 10000 });
  await coursesButton.click();
  return waitForMainReady(page);
}

async function openUsersTab(page) {
  const usersButton = page.getByRole('button', { name: '用户管理' });
  await expect(usersButton).toBeVisible({ timeout: 10000 });
  await usersButton.click();
  return waitForMainReady(page);
}

async function getAuthHeaders(page) {
  const token = await page.evaluate(() => localStorage.getItem('token'));
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function apiCreateCourse(request, teacherUsername, data) {
  const teacher = await apiLogin(request, teacherUsername);
  const response = await request.post(`${API_BASE}/teaching/courses`, {
    headers: { Authorization: `Bearer ${teacher.token}` },
    data,
  });
  const payload = await response.json();
  if (!response.ok()) {
    throw new Error(payload?.msg || 'Create course failed');
  }
  return payload.data;
}

async function apiDeleteCourse(request, teacherUsername, courseId) {
  const teacher = await apiLogin(request, teacherUsername);
  await request.delete(`${API_BASE}/teaching/courses/${courseId}`, {
    headers: { Authorization: `Bearer ${teacher.token}` },
  });
}

async function apiCreateLessonPlan(request, teacherUsername, courseId, title) {
  const teacher = await apiLogin(request, teacherUsername);
  const response = await request.post(`${API_BASE}/teaching/lesson-plans`, {
    headers: { Authorization: `Bearer ${teacher.token}` },
    data: { course_id: courseId, title },
  });
  const payload = await response.json();
  if (!response.ok()) {
    throw new Error(payload?.msg || 'Create lesson plan failed');
  }
  return payload.data.id;
}

async function apiJoinCourse(request, studentUsername, courseId) {
  const student = await apiLogin(request, studentUsername);
  const response = await request.post(`${API_BASE}/teaching/courses/join`, {
    headers: { Authorization: `Bearer ${student.token}` },
    data: { course_id: courseId },
  });
  const payload = await response.json();
  if (!response.ok() && !String(payload?.msg || '').includes('已经加入')) {
    throw new Error(payload?.msg || 'Join course failed');
  }
}

async function apiAddUser(request, user) {
  const admin = await apiLogin(request, 'admin');
  const response = await request.post(`${API_BASE}/admin/users`, {
    headers: { Authorization: `Bearer ${admin.token}` },
    data: user,
  });
  const payload = await response.json();
  if (!response.ok()) {
    throw new Error(payload?.msg || 'Add user failed');
  }
  return payload.data.id;
}

async function apiDeleteUser(request, userId) {
  const admin = await apiLogin(request, 'admin');
  await request.delete(`${API_BASE}/admin/users/${userId}`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
}

async function deleteCourseByName(page, request, courseName) {
  const headers = await getAuthHeaders(page);
  const response = await request.get(`${API_BASE}/teaching/courses`, { headers });
  const payload = await response.json();
  const course = (payload.data || []).find((item) => item.name === courseName);
  if (course) {
    await request.delete(`${API_BASE}/teaching/courses/${course.id}`, { headers });
  }
}

async function deleteResourceByName(page, request, resourceName) {
  const headers = await getAuthHeaders(page);
  const response = await request.get(`${API_BASE}/teaching/resources`, { headers });
  const payload = await response.json();
  const resource = (payload.data || []).find((item) => item.name === resourceName);
  if (resource) {
    await request.delete(`${API_BASE}/teaching/resources/${resource.id}`, { headers });
  }
}

function courseCard(page, courseName) {
  return page
    .getByRole('heading', { name: courseName })
    .locator('xpath=ancestor::div[.//button[contains(., "管理章节") or contains(., "进入练习")]][1]');
}

function planCard(page, planTitle) {
  return page
    .getByRole('heading', { name: planTitle })
    .locator('xpath=ancestor::div[.//button[contains(., "编辑章节")]][1]');
}

function resourceCard(page, resourceName) {
  return page
    .getByRole('heading', { name: resourceName })
    .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
}

function acceptAllDialogs(page) {
  const handler = (dialog) => dialog.accept();
  page.on('dialog', handler);
  return () => page.off('dialog', handler);
}

test('admin can view system logs table content', async ({ page, request }) => {
  const uniqueUsername = `log-user-${Date.now()}`;
  const userId = await apiAddUser(request, {
    username: uniqueUsername,
    password: '123',
    role: 'student',
    name: 'Log User',
  });

  try {
    await openAs(page, request, 'admin');
    await page.getByRole('button', { name: '系统日志' }).click();

    const mainArea = await waitForMainReady(page);
    const table = mainArea.locator('table');
    await expect(table).toBeVisible();
    await expect(table.locator('thead th')).toHaveCount(4);
    await expect(table.locator('tbody tr').first()).toBeVisible();
    await expect(table.locator('tbody')).toContainText(uniqueUsername);
  } finally {
    await apiDeleteUser(request, userId);
  }
});

test('admin can delete a user from user management', async ({ page, request }) => {
  const uniqueUsername = `del-user-${Date.now()}`;
  const userId = await apiAddUser(request, {
    username: uniqueUsername,
    password: '123',
    role: 'student',
    name: 'Delete User',
  });

  try {
    await openAs(page, request, 'admin');
    await openUsersTab(page);

    const row = page.locator('tbody tr').filter({ hasText: uniqueUsername });
    await expect(row).toBeVisible({ timeout: 10000 });

    const stopAccepting = acceptAllDialogs(page);
    await row.getByRole('button', { name: '删除' }).click();
    stopAccepting();

    await expect(page.getByText(uniqueUsername)).toHaveCount(0, { timeout: 10000 });
  } finally {
    await apiDeleteUser(request, userId);
  }
});

test('teacher can create and delete a course', async ({ page, request }) => {
  await openAs(page, request, 'teacher');
  await openCoursesTab(page);

  const mainArea = await waitForMainReady(page);
  await mainArea.getByRole('button').nth(0).click();

  const modal = page.locator('.fixed.inset-0').last();
  const courseName = `auto-course-${Date.now()}`;
  try {
    await modal.getByRole('textbox').nth(0).fill(courseName);
    await modal.locator('textarea').fill('Created by Playwright test');
    await modal.getByRole('button').nth(1).click();

    const card = courseCard(page, courseName);
    await expect(card).toBeVisible({ timeout: 10000 });

    const stopAccepting = acceptAllDialogs(page);
    await card.getByRole('button').last().click();
    stopAccepting();
    await expect(page.getByText(courseName)).toHaveCount(0, { timeout: 10000 });
  } finally {
    await deleteCourseByName(page, request, courseName);
  }
});

test('teacher can remove a student from a course', async ({ page, request }) => {
  const courseName = `remove-course-${Date.now()}`;
  const studentUsername = `remove-student-${Date.now()}`;
  const course = await apiCreateCourse(request, 'teacher', {
    name: courseName,
    code: `REMOVE-${Date.now()}`,
    objectives: 'Remove student flow test',
  });
  const studentId = await apiAddUser(request, {
    username: studentUsername,
    password: '123',
    role: 'student',
    name: 'Remove Student',
  });

  try {
    const teacher = await apiLogin(request, 'teacher');
    await request.post(`${API_BASE}/teaching/courses/${course.id}/students`, {
      headers: { Authorization: `Bearer ${teacher.token}` },
      data: { student_id: studentId },
    });

    await openAs(page, request, 'teacher');
    await openCoursesTab(page);
    await courseCard(page, courseName).getByRole('button').nth(1).click();

    const studentRow = page
      .locator('.p-4.border.rounded-lg.flex.justify-between.items-center.bg-indigo-50')
      .filter({ hasText: studentUsername });
    await expect(studentRow).toBeVisible({ timeout: 10000 });

    const stopAccepting = acceptAllDialogs(page);
    await studentRow.getByRole('button').click();
    stopAccepting();

    await expect(page.getByText(studentUsername)).toHaveCount(0, { timeout: 10000 });
  } finally {
    await apiDeleteCourse(request, 'teacher', course.id);
    await apiDeleteUser(request, studentId);
  }
});

test('student can join a course', async ({ page, request }) => {
  const courseName = `join-course-${Date.now()}`;
  const course = await apiCreateCourse(request, 'teacher', {
    name: courseName,
    code: `JOIN-${Date.now()}`,
    objectives: 'Join flow test',
  });

  try {
    await openAs(page, request, 'student');
    await openCoursesTab(page);
    const mainArea = await waitForMainReady(page);
    await mainArea.getByRole('button').nth(0).click();

    const modal = page.locator('.fixed.inset-0').last();
    page.on('dialog', (dialog) => dialog.accept());
    await modal.getByRole('textbox').nth(0).fill(String(course.code));
    await modal.getByRole('button').nth(1).click();

    await expect(page.getByRole('heading', { name: courseName })).toBeVisible({ timeout: 10000 });
  } finally {
    await apiDeleteCourse(request, 'teacher', course.id);
  }
});

test('teacher can create lesson plan', async ({ page, request }) => {
  const courseName = `plan-course-${Date.now()}`;
  const course = await apiCreateCourse(request, 'teacher', {
    name: courseName,
    code: `PLAN-${Date.now()}`,
    objectives: 'Plan flow test',
  });

  try {
    await openAs(page, request, 'teacher');
    await openCoursesTab(page);

    await courseCard(page, courseName).getByRole('button').first().click();
    const detailHeading = page.locator('main h2').first();
    await expect(detailHeading).toContainText(courseName, { timeout: 10000 });

    const planTitle = `auto-plan-${Date.now()}`;
    const mainButtons = page.locator('main button');
    await expect(mainButtons.nth(1)).toBeVisible({ timeout: 10000 });
    await mainButtons.nth(1).click();

    const modal = page.locator('.fixed.inset-0').last();
    await modal.getByRole('textbox').nth(0).fill(planTitle);
    await modal.getByRole('button').nth(1).click();

    await expect(planCard(page, planTitle)).toBeVisible({ timeout: 10000 });
  } finally {
    await apiDeleteCourse(request, 'teacher', course.id);
  }
});

test('teacher can edit and save a BOPPPS stage', async ({ page, request }) => {
  const courseName = `stage-course-${Date.now()}`;
  const course = await apiCreateCourse(request, 'teacher', {
    name: courseName,
    code: `STAGE-${Date.now()}`,
    objectives: 'Stage save test',
  });
  const planTitle = `stage-plan-${Date.now()}`;
  await apiCreateLessonPlan(request, 'teacher', course.id, planTitle);

  try {
    await openAs(page, request, 'teacher');
    await openCoursesTab(page);

    await courseCard(page, courseName).getByRole('button').first().click();
    const detailHeading = page.locator('main h2').first();
    await expect(detailHeading).toContainText(courseName, { timeout: 10000 });

    const existingPlanCard = planCard(page, planTitle);
    await expect(existingPlanCard).toBeVisible({ timeout: 10000 });
    await existingPlanCard.getByRole('button').first().click();

    const editor = page.locator('textarea').last();
    await expect(editor).toBeVisible({ timeout: 10000 });
    const content = `Playwright stage content ${Date.now()}`;
    await editor.fill(content);
    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('button').filter({ hasText: /保存|Save/ }).last().click();

    await page.locator('main button').first().click();
    await expect(planCard(page, planTitle)).toBeVisible({ timeout: 10000 });
    await planCard(page, planTitle).getByRole('button').first().click();
    await expect(page.locator('textarea').last()).toHaveValue(content, { timeout: 10000 });
  } finally {
    await apiDeleteCourse(request, 'teacher', course.id);
  }
});

test('quiz flow: teacher creates quiz, student submits, teacher rejects, student resubmits', async ({ page, request }) => {
  const stamp = Date.now();
  const courseName = `quiz-course-${stamp}`;
  const planTitle = `quiz-plan-${stamp}`;
  const quizTitle = `quiz-${stamp}`;
  const course = await apiCreateCourse(request, 'teacher', {
    name: courseName,
    code: `QUIZ-${stamp}`,
    objectives: 'Quiz e2e flow',
  });
  await apiCreateLessonPlan(request, 'teacher', course.id, planTitle);
  await apiJoinCourse(request, 'student', course.id);

  const stopAccepting = acceptAllDialogs(page);
  try {
    await openAs(page, request, 'teacher');
    await openCoursesTab(page);
    await courseCard(page, courseName).getByRole('button', { name: '管理章节' }).click();
    await page.getByRole('button', { name: '编辑章节' }).first().click();

    await page.getByRole('button', { name: '新建测验' }).click();
    const modal = page.locator('.fixed.inset-0').last();
    await modal.getByRole('textbox').first().fill(quizTitle);
    await modal.getByRole('checkbox').check();
    await modal.getByRole('button', { name: '新增题目' }).click();
    await modal.getByPlaceholder('请输入题干').fill('2+2=?');
    await modal.getByPlaceholder('选项 1').fill('3');
    await modal.getByPlaceholder('选项 2').fill('4');
    await modal.locator('select').filter({ hasText: '请选择标准答案' }).selectOption('4');
    await modal.getByRole('button', { name: '创建测验' }).click();
    await expect(page.getByText(quizTitle)).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: '推送给学生' }).click();

    await openAs(page, request, 'student');
    await openCoursesTab(page);
    await courseCard(page, courseName).getByRole('button', { name: '进入练习' }).click();
    await page.locator('div').filter({ hasText: quizTitle }).getByRole('button', { name: '开始作答' }).click();
    await page.locator('label').filter({ hasText: '4' }).first().click();
    await page.getByRole('button', { name: '提交测验' }).click();
    await page.locator('div').filter({ hasText: quizTitle }).getByRole('button', { name: '查看成绩' }).click();
    await expect(page.getByText('标准答案: 4')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('结果: 正确')).toBeVisible({ timeout: 10000 });

    await openAs(page, request, 'teacher');
    await openCoursesTab(page);
    await courseCard(page, courseName).getByRole('button', { name: '管理章节' }).click();
    await page.getByRole('button', { name: '编辑章节' }).first().click();
    await page.locator('div').filter({ hasText: quizTitle }).getByRole('button', { name: '查看提交' }).click();
    await page.getByRole('button', { name: '打回重提' }).first().click();
    await expect(page.getByText('状态: rejected')).toBeVisible({ timeout: 10000 });

    await openAs(page, request, 'student');
    await openCoursesTab(page);
    await courseCard(page, courseName).getByRole('button', { name: '进入练习' }).click();
    await page.locator('div').filter({ hasText: quizTitle }).getByRole('button', { name: '开始作答' }).click();
    await page.locator('label').filter({ hasText: '4' }).first().click();
    await page.getByRole('button', { name: '提交测验' }).click();

    await openAs(page, request, 'teacher');
    await openCoursesTab(page);
    await courseCard(page, courseName).getByRole('button', { name: '管理章节' }).click();
    await page.getByRole('button', { name: '编辑章节' }).first().click();
    await expect(page.getByText('提交人数: 1').first()).toBeVisible({ timeout: 10000 });
  } finally {
    stopAccepting();
    await apiDeleteCourse(request, 'teacher', course.id);
  }
});

test('teacher can create and delete a link resource', async ({ page, request }) => {
  const courseName = `resource-course-${Date.now()}`;
  const course = await apiCreateCourse(request, 'teacher', {
    name: courseName,
    code: `RES-${Date.now()}`,
    objectives: 'Resource flow test',
  });
  await openAs(page, request, 'teacher');
  await page.getByRole('button', { name: '资源上传' }).click();

  const resourceName = `auto-resource-${Date.now()}`;
  const mainArea = await waitForMainReady(page);
  const form = mainArea.locator('form').first();

  try {
    await form.getByRole('textbox').nth(0).fill(resourceName);
    await form.locator('select').first().selectOption(String(course.id));
    await form.locator('button[type="button"]').nth(1).click();
    await form.locator('input[type="url"]').fill('https://example.com/teaching-resource');
    await form.locator('button[type="submit"]').click();

    const card = resourceCard(page, resourceName);
    await expect(card).toBeVisible({ timeout: 10000 });

    page.on('dialog', (dialog) => dialog.accept());
    await card.getByRole('button').last().click();
    await expect(page.getByText(resourceName)).toHaveCount(0, { timeout: 10000 });
  } finally {
    await deleteResourceByName(page, request, resourceName);
    await apiDeleteCourse(request, 'teacher', course.id);
  }
});

test('teacher can upload a file resource', async ({ page, request }) => {
  const courseName = `file-course-${Date.now()}`;
  const course = await apiCreateCourse(request, 'teacher', {
    name: courseName,
    code: `FILE-${Date.now()}`,
    objectives: 'File resource flow test',
  });
  await openAs(page, request, 'teacher');
  await page.getByRole('button', { name: '资源上传' }).click();

  const resourceName = `file-resource-${Date.now()}`;
  const mainArea = await waitForMainReady(page);
  const form = mainArea.locator('form').first();
  const fixturePath = path.join(__dirname, '..', 'fixtures', 'sample-resource.txt');

  try {
    await form.getByRole('textbox').nth(0).fill(resourceName);
    await form.locator('select').first().selectOption(String(course.id));
    await form.locator('input[type="file"]').setInputFiles(fixturePath);
    await form.locator('button[type="submit"]').click();

    await expect(resourceCard(page, resourceName)).toBeVisible({ timeout: 10000 });
  } finally {
    await deleteResourceByName(page, request, resourceName);
    await apiDeleteCourse(request, 'teacher', course.id);
  }
});

test('user can change password from settings', async ({ page, request }) => {
  const username = `pwd-user-${Date.now()}`;
  const oldPassword = '123';
  const newPassword = `newpass-${Date.now()}`;
  const userId = await apiAddUser(request, {
    username,
    password: oldPassword,
    role: 'student',
    name: 'Password User',
  });

  try {
    await openAs(page, request, username, oldPassword);
    const sidebarButtons = page.locator('aside nav button');
    await sidebarButtons.last().click();

    const mainArea = await waitForMainReady(page);
    const inputs = mainArea.locator('input[type="password"]');
    await inputs.nth(0).fill(oldPassword);
    await inputs.nth(1).fill(newPassword);
    await inputs.nth(2).fill(newPassword);

    page.on('dialog', (dialog) => dialog.accept());
    await mainArea.getByRole('button').last().click();

    await expect(async () => {
      const session = await apiLogin(request, username, newPassword);
      expect(session.username).toBe(username);
    }).toPass();
  } finally {
    await apiDeleteUser(request, userId);
  }
});

test('visitor can register a new account', async ({ page, request }) => {
  const username = `reg-user-${Date.now()}`;
  const password = '123456';
  const name = 'Register User';

  let createdUserId = null;
  try {
    await page.goto('/');
    await page.getByRole('button').last().click();

    const inputs = page.locator('input');
    await inputs.nth(0).fill(username);
    await inputs.nth(1).fill(name);
    await inputs.nth(2).fill(password);

    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: '注册' }).click();

    await expect(page.getByRole('button', { name: '登录' })).toBeVisible({ timeout: 10000 });

    const session = await apiLogin(request, username, password);
    createdUserId = session ? session.id : null;
    expect(session.username).toBe(username);
  } finally {
    if (createdUserId) {
      await apiDeleteUser(request, createdUserId);
    }
  }
});
