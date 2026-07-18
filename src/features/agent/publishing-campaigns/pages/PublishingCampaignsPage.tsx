import React, { useState } from 'react';
import PublishingSubnav from '../../social-publishing/shared/PublishingSubnav';
import CampaignsPanel from '../components/CampaignsPanel';

export default function PublishingCampaignsPage({ canManage }: { canManage: boolean }) {
  const [message, setMessage] = useState('');

  return (
    <div className="space-y-4">
      <PublishingSubnav
        title="Campaign"
        subtitle="Đăng một bản nháp lên nhiều kênh — theo dõi tiến độ run"
        active="campaigns"
        message={message}
      />
      <CampaignsPanel canManage={canManage} onMessage={setMessage} />
    </div>
  );
}
