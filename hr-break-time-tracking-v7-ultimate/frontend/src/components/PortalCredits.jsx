export default function PortalCredits({ className = '', employeePortal = false }) {
  if (employeePortal) {
    return (
      <p className={['portal-credits', className].filter(Boolean).join(' ')}>
        <span>PortCity BPO - HTSK Division | ©2026 All Rights Reserved</span>
        <span>Version 7.0 Ultimate - Employee Break & Attendance Tracking System</span>
      </p>
    );
  }

  return (
    <p className={['portal-credits', className].filter(Boolean).join(' ')}>
      <span>HTSK - PortCity BPO ©2026</span>
      {/*<span>©2026 All Rights Reserved</span>}*/}
      <span>Employee Break & Attendance Tracker</span>
      <span>Version 7.0 Ultimate</span>
    </p>
  );
}
