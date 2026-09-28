export default function PortalCredits({ className = '', employeePortal = false }) {
  if (employeePortal) {
    return (
      <p className={['portal-credits', className].filter(Boolean).join(' ')}>
        <span>HTSK - PortCity BPO (Pvt) Ltd | ©2026 All Rights Reserved</span>
        <span>Version 6.0 Ultimate - Employee Break Tracking System</span>
      </p>
    );
  }

  return (
    <p className={['portal-credits', className].filter(Boolean).join(' ')}>
      <span>HTSK - PortCity BPO (Pvt) Ltd ©2026</span>
      {/*<span>©2026 All Rights Reserved</span>}*/}
      <span>Employee Break Tracking System</span>
      <span>Version 6.0 Ultimate</span>
    </p>
  );
}
