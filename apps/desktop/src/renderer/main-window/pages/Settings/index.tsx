import React, { useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import SettingsCenter, {
  SettingsSection,
} from '../../../common/settings/SettingsCenter';

const VALID: SettingsSection[] = [
  'voice',
  'reply',
  'shop',
  'points',
  'points-bal',
  'points-rech',
  'points-usage',
  'account',
  'about',
  'kw-match',
  'kw-replace',
  'kw-transfer',
  'kw-history',
];

const SettingsPage = () => {
  const { section: sectionParam } = useParams<{ section: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const section = useMemo<SettingsSection>(() => {
    if (sectionParam && VALID.includes(sectionParam as SettingsSection)) {
      return sectionParam as SettingsSection;
    }
    return 'account';
  }, [sectionParam]);

  const appId = searchParams.get('appId') || undefined;
  const instanceId = searchParams.get('instanceId') || undefined;

  return (
    <SettingsCenter
      section={section}
      appId={appId}
      instanceId={instanceId}
      onOpenKeywords={(tab = 0) => {
        const map = ['kw-match', 'kw-replace', 'kw-transfer', 'kw-history'];
        navigate(`/settings/${map[tab] || 'kw-match'}`);
      }}
      onShopContextChange={(next) => {
        const nextParams = new URLSearchParams(searchParams);
        if (next.appId) nextParams.set('appId', next.appId);
        else nextParams.delete('appId');
        if (next.instanceId) nextParams.set('instanceId', next.instanceId);
        else nextParams.delete('instanceId');
        setSearchParams(nextParams, { replace: true });
      }}
    />
  );
};

export default SettingsPage;
