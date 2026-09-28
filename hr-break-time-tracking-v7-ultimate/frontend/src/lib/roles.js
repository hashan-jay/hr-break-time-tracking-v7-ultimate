export function roleLabel(roles = []) {
  if (roles.includes('Developer')) return 'System Developer';
  if (roles.includes('SystemAdministration')) return 'System Administration';
  if (roles.includes('HRManager')) return 'HR Manager';
  if (roles.includes('HRAssistant')) return 'HR Assistant';
  return roles.join(', ') || 'Staff';
}

export function portalTitle(roles = []) {
  if (roles.includes('Developer')) return "Developer's Portal";
  if (roles.includes('SystemAdministration')) return "System Administration's Portal";
  if (roles.includes('HRManager')) return "HR Manager's Portal";
  if (roles.includes('HRAssistant')) return "HR Assistant's Portal";
  return "Staff Portal";
}

export function timeGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Good Morning';
  if (hour >= 12 && hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export function roleGreeting(roles = [], date = new Date()) {
  return `${timeGreeting(date)}, ${roleLabel(roles)}`;
}
