// Helper function to validate email
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Helper function to validate username
const isValidUsername = (username) => {
  // Username should be 3-20 characters, alphanumeric and underscores only
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  return usernameRegex.test(username);
};

// Reserved usernames that shouldn't be allowed
const reservedUsernames = [
  'admin', 'administrator', 'root', 'system', 'api', 'support', 'help',
  'info', 'contact', 'about', 'privacy', 'terms', 'service', 'app',
  'chatapp', 'chat', 'user', 'users', 'profile', 'settings', 'login',
  'signup', 'register', 'auth', 'authentication', 'bot', 'official'
];

const isReservedUsername = (username) => {
  return reservedUsernames.includes(username.toLowerCase());
};

// Password validation
const isValidPassword = (password) => {
  return password && password.length >= 6;
};

// Name validation
const isValidName = (name) => {
  return name && name.trim().length >= 1 && name.trim().length <= 50;
};

const isValidURL = (url) => {
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
};

module.exports = {
  isValidEmail,
  isValidUsername,
  isReservedUsername,
  isValidPassword,
  isValidName,
  isValidURL
};