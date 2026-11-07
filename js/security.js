export function watchExamTabSwitch(onViolation) {
  let terminated = false;

  const terminate = () => {
    if (!terminated) {
      terminated = true;
      onViolation('Student switched tabs or left the examination page.');
    }
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'hidden') terminate();
  };

  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('pagehide', terminate);

  return () => {
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('pagehide', terminate);
  };
}
