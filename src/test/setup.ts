import { useLicenseStore } from '@/store/licenseStore';

useLicenseStore.setState({
  state: {
    status: 'trial',
    canEdit: true,
    machineCode: '',
    trialStart: 0,
    trialEnd: 0,
    daysRemaining: 7,
    hoursRemaining: 7 * 24,
    license: null,
    checkedAt: 0,
    reason: '',
  },
  initialized: true,
});
