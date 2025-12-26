// admin-layout.js

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderAdminLayout({ title, content, activeMenu = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/admin/styles.css" />
</head>
<body>
  <div class="admin-container">
    
    <!-- ADMIN LOGO -->
    <div class="admin-logo">
      <img src="/assets/icons/admin-logo.svg" alt="Admin Logo" />
    </div>

    <!-- ADMIN HEADER -->
    <div class="admin-header">
      <h1>Admin Panel</h1>
      <div class="header-actions">
        <span class="header-user">👤 Administrator</span>
      </div>
    </div>

    <!-- ADMIN LEFT MENU -->
    <div class="admin-menu">
      ${renderMenu(activeMenu)}
      
      <div class="menu-logout">
        <form method="POST" action="/admin/logout">
          <button type="submit" class="logout-btn">Log Out</button>
        </form>
      </div>
    </div>

    <!-- ADMIN HERO -->
    <div class="admin-hero">
      <div class="hero-content">
        ${content}
      </div>
    </div>

  </div>

  <script src="/admin/menu.js"></script>
</body>
</html>`;
}

function renderMenu(activeMenu = '') {
  const menus = [
    {
      id: 'users',
      label: 'Users',
      icon: '👥',
      children: [
        { id: 'users-list', label: 'All Users', href: '/admin/users' },
        { id: 'users-add', label: 'Add User', href: '/admin/users/add' },
      ]
    },
    {
      id: 'photos',
      label: 'Photos',
      icon: '📷',
      children: [
        { id: 'photos-dashboard', label: 'Photo Dashboard', href: '/admin/dashboard' },
        { id: 'photos-folders', label: 'Manage Folders', href: '/admin/folders' },
        { id: 'photos-upload', label: 'Upload Photos', href: '/admin/upload' },
      ]
    },
    {
      id: 'transactions',
      label: 'Transactions',
      icon: '💸',
      children: [
        { id: 'transactions-list', label: 'All Transactions', href: '/admin/transactions' },
      ]
    }

  ];

  return menus.map(menu => {
    const isActive = activeMenu.startsWith(menu.id);
    const hasActiveChild = menu.children.some(child => activeMenu === child.id);
    
    return `
      <div class="menu-section">
        <div class="menu-parent ${isActive || hasActiveChild ? 'active expanded' : ''}" 
             onclick="toggleMenu('${menu.id}')">
          <span>
            <span class="menu-icon">${menu.icon}</span>
            ${escapeHtml(menu.label)}
          </span>
          <span class="menu-arrow">▼</span>
        </div>
        <div class="menu-children ${isActive || hasActiveChild ? 'open' : ''}" id="menu-${menu.id}">
          ${menu.children.map(child => `
            <a href="${escapeHtml(child.href)}" 
               class="menu-child ${activeMenu === child.id ? 'active' : ''}">
              ${escapeHtml(child.label)}
            </a>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

module.exports = { renderAdminLayout };