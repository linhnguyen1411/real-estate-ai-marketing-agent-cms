import { describe, it, expect } from 'vitest';
import { processRawPostToLead } from '../../desktop/src/main/pipeline/leadScoringPipeline';

describe('Desktop Agent Lead Scoring Pipeline', () => {
  it('correctly extracts and scores SUPPLY lead with Nam Hòa Xuân block and phone', () => {
    const rawText = 'Chính chủ cần bán gấp lô B2-14 Nam Hòa Xuân, đường 7m5 giá 3 tỷ 450 triệu, sổ đỏ trao tay. Liên hệ ngay 0905123456 để xem đất.';
    const lead = processRawPostToLead('facebook', 'Nhóm BĐS Đà Nẵng', rawText, {
      authorName: 'Nguyễn Văn A',
      externalId: '123456789',
    });

    expect(lead.sourceType).toBe('facebook');
    expect(lead.classification).toBe('SUPPLY');
    expect(lead.authorPhone).toBe('0905123456');
    expect(lead.projectBlock).toBeDefined();
    expect(lead.projectBlock).toMatch(/B2[-.]14/i);
    expect(lead.intentScore).toBeGreaterThanOrEqual(70);
    expect(lead.isHotLead).toBe(true);
    expect(lead.askingPrice).toBeDefined();
  });

  it('correctly extracts and scores DEMAND lead from Zalo message', () => {
    const rawText = 'Em cần tìm mua gấp lô đất Nam Hòa Xuân khu B1-20 hướng Đông Nam tài chính dưới 3.8 tỷ, có khách sẵn công chứng ngay alo 0987654321';
    const lead = processRawPostToLead('zalo', 'Hội Môi Giới BĐS Hòa Xuân', rawText, {
      authorName: 'Trần Thị B',
    });

    expect(lead.sourceType).toBe('zalo');
    expect(lead.classification).toBe('DEMAND');
    expect(lead.authorPhone).toBe('0987654321');
    expect(lead.projectBlock).toBeDefined();
    expect(lead.projectBlock).toMatch(/B1[-.]20/i);
    expect(lead.intentScore).toBeGreaterThanOrEqual(70);
    expect(lead.isHotLead).toBe(true);
  });

  it('handles general text without hot lead score', () => {
    const rawText = 'Chào cả nhà, chúc mọi người ngày mới vui vẻ tràn đầy năng lượng';
    const lead = processRawPostToLead('facebook', 'Nhóm BĐS', rawText);

    expect(lead.classification).toBe('UNKNOWN');
    expect(lead.isHotLead).toBe(false);
    expect(lead.authorPhone).toBeUndefined();
  });
});
