const ready = window.reaperAdmin
  ? Promise.resolve(window.reaperAdmin)
  : new Promise((resolve) => document.addEventListener('reaper:admin-ready', (event) => resolve(event.detail), { once: true }));

const view = document.body.dataset.workflowView;
const tableWrap = document.getElementById('workflow-table');
const summary = document.getElementById('workflow-summary');

let clients = [];
let cases = [];
const clientMap = () => new Map(clients.map((client) => [client.id, client]));
const fmtDate = (value) => value ? new Date(value).toLocaleString() : '—';

function makeSelect(values, current) {
  const select = document.createElement('select');
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value.replace(/_/g, ' ');
    if (value === current) option.selected = true;
    select.appendChild(option);
  }
  if (current && !values.includes(current)) {
    const option = document.createElement('option');
    option.value = current;
    option.textContent = current.replace(/_/g, ' ');
    option.selected = true;
    select.prepend(option);
  }
  return select;
}

async function loadReferenceData(supabase) {
  const [{ data: clientRows, error: clientError }, { data: caseRows, error: caseError }] = await Promise.all([
    supabase.from('clients').select('id,profile_id,full_name,email,status').order('created_at', { ascending: false }),
    supabase.from('cases').select('id,client_id,title,case_type,status,stage,priority,next_action_at,created_at').order('created_at', { ascending: false }),
  ]);
  if (clientError || caseError) throw clientError || caseError;
  clients = clientRows || [];
  cases = caseRows || [];
}

async function loadCases(supabase) {
  await loadReferenceData(supabase);
  const map = clientMap();
  tableWrap.replaceChildren();
  summary.textContent = `${cases.length} case${cases.length === 1 ? '' : 's'}`;
  if (!cases.length) {
    tableWrap.textContent = 'No cases yet. A case is created automatically when an intake is approved.';
    return;
  }

  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>Client</th><th>Engagement</th><th>Status</th><th>Stage</th><th>Priority</th><th>Next action</th><th>Save</th></tr></thead>';
  const tbody = document.createElement('tbody');

  for (const item of cases) {
    const tr = document.createElement('tr');
    const client = map.get(item.client_id);

    const clientTd = document.createElement('td');
    clientTd.textContent = client?.full_name || client?.email || item.client_id;
    tr.appendChild(clientTd);

    const titleTd = document.createElement('td');
    titleTd.textContent = item.title || item.case_type || 'Client engagement';
    tr.appendChild(titleTd);

    const statusTd = document.createElement('td');
    const statusSelect = makeSelect(['open','in_progress','on_hold','closed','completed'], item.status || 'open');
    statusTd.appendChild(statusSelect);
    tr.appendChild(statusTd);

    const stageTd = document.createElement('td');
    const stageSelect = makeSelect(['onboarding','quote_sent','quote_declined','payment_pending','awaiting_documents','active','review','complete'], item.stage || 'onboarding');
    stageTd.appendChild(stageSelect);
    tr.appendChild(stageTd);

    const priorityTd = document.createElement('td');
    const prioritySelect = makeSelect(['low','normal','high','urgent'], item.priority || 'normal');
    priorityTd.appendChild(prioritySelect);
    tr.appendChild(priorityTd);

    const nextTd = document.createElement('td');
    const nextInput = document.createElement('input');
    nextInput.type = 'datetime-local';
    if (item.next_action_at) {
      const date = new Date(item.next_action_at);
      const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
      nextInput.value = local;
    }
    nextTd.appendChild(nextInput);
    tr.appendChild(nextTd);

    const actionTd = document.createElement('td');
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'button';
    save.textContent = 'Save';
    save.addEventListener('click', async () => {
      save.disabled = true;
      save.textContent = 'Saving…';
      const nextAction = nextInput.value ? new Date(nextInput.value).toISOString() : null;
      const closedAt = ['closed','completed'].includes(statusSelect.value) ? new Date().toISOString() : null;
      const { error } = await supabase.from('cases').update({
        status: statusSelect.value,
        stage: stageSelect.value,
        priority: prioritySelect.value,
        next_action_at: nextAction,
        closed_at: closedAt,
      }).eq('id', item.id);
      save.disabled = false;
      save.textContent = error ? 'Retry' : 'Saved';
      if (error) {
        console.error('Case update error', error);
        window.alert('Case update could not be saved.');
      } else {
        setTimeout(() => { save.textContent = 'Save'; }, 1000);
      }
    });
    actionTd.appendChild(save);
    tr.appendChild(actionTd);

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  tableWrap.appendChild(table);
}

function populateTaskForm() {
  const clientSelect = document.getElementById('task-client');
  const caseSelect = document.getElementById('task-case');
  if (!clientSelect || !caseSelect) return;

  clientSelect.innerHTML = '<option value="">Select client</option>';
  for (const client of clients) {
    const option = document.createElement('option');
    option.value = client.id;
    option.textContent = `${client.full_name || client.email} (${client.email})`;
    clientSelect.appendChild(option);
  }

  const refreshCases = () => {
    caseSelect.innerHTML = '<option value="">No case selected</option>';
    for (const item of cases.filter((row) => row.client_id === clientSelect.value)) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.title || item.case_type || item.id;
      caseSelect.appendChild(option);
    }
  };
  clientSelect.addEventListener('change', refreshCases);
  refreshCases();
}

async function loadTasks(supabase) {
  await loadReferenceData(supabase);
  populateTaskForm();
  const map = clientMap();
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id,client_id,case_id,title,description,status,priority,assigned_to,due_date,completed_at,created_at')
    .order('created_at', { ascending: false });

  tableWrap.replaceChildren();
  if (error) {
    console.error('Task load error', error);
    tableWrap.textContent = 'Tasks could not be loaded.';
    summary.textContent = 'Unavailable';
    return;
  }

  summary.textContent = `${tasks?.length || 0} task${tasks?.length === 1 ? '' : 's'}`;
  if (!tasks?.length) {
    tableWrap.textContent = 'No tasks yet.';
    return;
  }

  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>Client</th><th>Task</th><th>Status</th><th>Priority</th><th>Due</th><th>Assigned</th><th>Save</th></tr></thead>';
  const tbody = document.createElement('tbody');

  for (const task of tasks) {
    const tr = document.createElement('tr');
    const client = map.get(task.client_id);
    const clientTd = document.createElement('td');
    clientTd.textContent = client?.full_name || client?.email || task.client_id;
    tr.appendChild(clientTd);

    const titleTd = document.createElement('td');
    titleTd.textContent = task.title;
    if (task.description) {
      const small = document.createElement('div');
      small.style.opacity = '0.75';
      small.style.marginTop = '4px';
      small.textContent = task.description;
      titleTd.appendChild(small);
    }
    tr.appendChild(titleTd);

    const statusTd = document.createElement('td');
    const statusSelect = makeSelect(['open','in_progress','blocked','completed','closed'], task.status || 'open');
    statusTd.appendChild(statusSelect);
    tr.appendChild(statusTd);

    const priorityTd = document.createElement('td');
    const prioritySelect = makeSelect(['low','normal','high','urgent'], task.priority || 'normal');
    priorityTd.appendChild(prioritySelect);
    tr.appendChild(priorityTd);

    const dueTd = document.createElement('td');
    const dueInput = document.createElement('input');
    dueInput.type = 'datetime-local';
    if (task.due_date) {
      const date = new Date(task.due_date);
      dueInput.value = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
    }
    dueTd.appendChild(dueInput);
    tr.appendChild(dueTd);

    const assignedTd = document.createElement('td');
    assignedTd.textContent = task.assigned_to === client?.profile_id ? 'Client' : 'Administrator';
    tr.appendChild(assignedTd);

    const actionTd = document.createElement('td');
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'button';
    save.textContent = 'Save';
    save.addEventListener('click', async () => {
      save.disabled = true;
      save.textContent = 'Saving…';
      const isComplete = ['completed','closed'].includes(statusSelect.value);
      const { error: updateError } = await supabase.from('tasks').update({
        status: statusSelect.value,
        priority: prioritySelect.value,
        due_date: dueInput.value ? new Date(dueInput.value).toISOString() : null,
        completed_at: isComplete ? (task.completed_at || new Date().toISOString()) : null,
      }).eq('id', task.id);
      save.disabled = false;
      save.textContent = updateError ? 'Retry' : 'Saved';
      if (updateError) {
        console.error('Task update error', updateError);
        window.alert('Task update could not be saved.');
      } else {
        setTimeout(() => { save.textContent = 'Save'; }, 1000);
      }
    });
    actionTd.appendChild(save);
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  tableWrap.appendChild(table);
}

function wireTaskCreation(context) {
  const form = document.getElementById('task-create-form');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const { supabase, profile } = context;
    const clientId = document.getElementById('task-client').value;
    const caseId = document.getElementById('task-case').value || null;
    const title = document.getElementById('task-title').value.trim();
    const description = document.getElementById('task-description').value.trim();
    const priority = document.getElementById('task-priority').value;
    const due = document.getElementById('task-due').value;
    const assignee = document.getElementById('task-assignee').value;
    const submit = document.getElementById('task-create-submit');
    const status = document.getElementById('task-create-status');
    const client = clients.find((row) => row.id === clientId);

    if (!client || !title) {
      status.textContent = 'Select a client and enter a task title.';
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Creating…';
    const { error } = await supabase.from('tasks').insert({
      client_id: clientId,
      case_id: caseId,
      title,
      description: description || null,
      status: 'open',
      priority,
      due_date: due ? new Date(due).toISOString() : null,
      assigned_to: assignee === 'client' ? client.profile_id : profile.id,
    });
    submit.disabled = false;
    submit.textContent = 'Create task';

    if (error) {
      console.error('Task creation error', error);
      status.textContent = 'Task could not be created.';
      return;
    }

    status.textContent = 'Task created.';
    form.reset();
    populateTaskForm();
    await loadTasks(supabase);
  });
}

ready.then(async (context) => {
  if (view === 'cases') {
    await loadCases(context.supabase);
  } else if (view === 'tasks') {
    await loadTasks(context.supabase);
    wireTaskCreation(context);
  }
}).catch((error) => {
  console.error('Workflow admin error', error);
  if (tableWrap) tableWrap.textContent = 'Workflow workspace is unavailable.';
  if (summary) summary.textContent = 'Unavailable';
});
