export function getOrCreateStudentKey() {
  const K = 'student_key';
  let v = localStorage.getItem(K);
  if (!v) {
    v = 's_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    localStorage.setItem(K, v);
  }
  return v;
}
