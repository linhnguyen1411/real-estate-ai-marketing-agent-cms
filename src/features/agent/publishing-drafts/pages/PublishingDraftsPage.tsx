import React, { useState } from 'react';
import PublishingSubnav from '../../social-publishing/shared/PublishingSubnav';
import DraftsPanel from '../../social-publishing/components/DraftsPanel';

export default function PublishingDraftsPage({ canManage }: { canManage: boolean }) {
  const [message, setMessage] = useState('');

  return (
    <div className="space-y-4">
      <PublishingSubnav
        title="Bản nháp"
        subtitle="Tạo, duyệt, lên lịch hoặc đăng ngay — duplicate / AI regenerate / archive"
        active="drafts"
        message={message}
      />
      <DraftsPanel canManage={canManage} onMessage={setMessage} />
    </div>
  );
}
