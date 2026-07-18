import React, { useState } from 'react';
import PublishingSubnav from '../../social-publishing/shared/PublishingSubnav';
import CalendarQueuePanel from '../../social-publishing/components/CalendarQueuePanel';

export default function PublishingSchedulePage({ canManage }: { canManage: boolean }) {
  const [message, setMessage] = useState('');

  return (
    <div className="space-y-4">
      <PublishingSubnav
        title="Lịch đăng"
        subtitle="Lưới tháng — kéo thả job, publish now, hủy / retry"
        active="schedule"
        message={message}
      />
      <CalendarQueuePanel canManage={canManage} onMessage={setMessage} />
    </div>
  );
}
