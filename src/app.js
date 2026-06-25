export const ORGS = [
  { id: 'wmay',  name: 'WMay',  hashtag: '#WMay',  color: '#E8232A' },
  { id: 'dmop',  name: 'dMOP',  hashtag: '#dMOP',  color: '#0057A8' },
  { id: 'onaap', name: 'ONAAP', hashtag: '#ONAAP', color: '#F5A623' },
  { id: 'iaas',  name: 'IAAs',  hashtag: '#IAAs',  color: '#6B3FA0' },
  { id: 'ucpb',  name: 'UCPB',  hashtag: '#UCPB',  color: '#00843D' },
];

export const AppState = {
  selectedOrg: null,
  capturedBlob: null,
  capturedUrl: null,
  form: { firstName: '', lastName: '', email: '', company: '' },
};

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function (s) {
    s.classList.toggle('screen--active', s.id === 'screen-' + id);
  });
}

export function resetState() {
  if (AppState.capturedUrl) { URL.revokeObjectURL(AppState.capturedUrl); }
  AppState.selectedOrg = null;
  AppState.capturedBlob = null;
  AppState.capturedUrl = null;
  AppState.form = { firstName: '', lastName: '', email: '', company: '' };
}
