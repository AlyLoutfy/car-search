import { describe, expect, it } from 'vitest';
import { normalizeArabic, readBatteryHealth, readTaxStatus } from '../src/signals';

// Phrasings below are modelled on real iPhone 17 ads on Dubizzle Egypt (Sept 2026).

describe('normalizeArabic', () => {
  it('folds Arabic-Indic digits, the Arabic percent sign and invisible bidi marks', () => {
    expect(normalizeArabic('بطارية ٩٨٪؜')).toBe('بطاريه 98%');
  });

  it('unifies letter variants so one pattern matches every spelling', () => {
    expect(normalizeArabic('معفى ضريبة')).toBe('معفي ضريبه');
  });
});

describe('readTaxStatus', () => {
  it.each([
    ['عليه ضريبه', 'has tax on it'],
    ['كسر زيرو 17 عادي 256 علية ضريبة لسة متفعلتش', 'misspelt, not activated yet'],
    ['بحاله الجديد وعليه ضريبه ١٨٠٠٠', 'with a و prefix and the amount'],
    ['iPhone 17 (عليه ضريبه)', 'in brackets'],
    ['حاله زيرو مش مدفوع ضريبه', 'tax not paid'],
    ['نوع الجهاز يباني غير مدفوع الضريبة', 'tax unpaid'],
    ['Iphone 17 Bt:100% عليه ضريبه ١٨ الف', 'amount in thousands'],
    ['17 256g B 98% ضريبه 18k', 'amount with k'],
    ['في الضمان لسه فى فتره السماح', 'grace period running'],
    ['وفاضل علي مده الإعفاء شهر', 'exemption window running'],
    ['iPhone 17 100 B 256 G Box هيقف ضريبه اخر شهر ١٢', 'will be cut off'],
    ['الموبايل قافل ضريبة اللي هياخده يدفعها بايده', 'the buyer pays it'],
    ['غير مدفوع الضريبة، تدفع خلال شهرين (١٨ الف)', 'due within two months'],
    ['عليه ضريبه لسه فاضل ٣ شهور ونصف ع السداد', 'months left to pay'],
    ['ضريبه متحطش فيه خط يعني لسا فيه ٤ شهور استخدام', 'no SIM in it yet'],
    ['Customs/tax: 18,000 EGP, due in approximately 3 months', 'English, due'],
  ])('owed: %s (%s)', (text) => {
    expect(readTaxStatus(text)).toBe('owed');
  });

  it.each([
    ['ومعفي من الضرايب', 'exempt'],
    ['ضمان محلى تريد لاين سنتين معفى رسمى', 'officially exempt'],
    ['مدفوع ضريبه ومعاه البوكس', 'tax paid'],
    ['استخدام اربع شهور فقطط وخالص الضريبه دفعتها', 'tax settled'],
    ['والضريبة مدفوعة بالكامل', 'tax fully paid'],
    ['esim زيرو ضريبه ضمان 3 شهور', 'zero tax'],
    ['2 eSIM • من غير ضريبة', 'without tax'],
    ['معليهوش جنيه ضريبة معاه كل حاجته', '"not a pound of tax on it" — contains عليه'],
    ['خلصان ضريبة مش عليه جنية', 'cleared, nothing on it'],
    ['مش عليه ضريبه', 'negated "has tax"'],
    ['مفيهوش الهوا خالص ضريبه', 'settled'],
    ['Iphone 17 like new Battery health 99% TAX paid', 'English'],
    ['battery 92%, TAX PAYED.', 'English, misspelt'],
    ['Lavender Iphone 17- Used- Battery Life 91%- Customs paid', 'customs paid'],
    ['Zero taxis (معفي ضرايب)', 'mixed'],
    ['like new no taxes', 'no taxes'],
  ])('clear: %s (%s)', (text) => {
    expect(readTaxStatus(text)).toBe('clear');
  });

  it.each([
    ['iPhone 17 256 70 شحنة شرق اوسط متاح بدل ب اقل', 'no tax mention'],
    ['Iphone 17 Box Tax 100% متاح بدل', 'ambiguous "Box Tax 100%"'],
    ['الموبايل فيه ضربه خفيفه في الفريم وعليه ضربه صغيره', '"ضربه" is a dent, not tax'],
    ['almost new iPhone 17', 'English, nothing said'],
    ['المشتري مش هيدفعها', 'negated "the buyer pays it"'],
    ['متاح بالتقسيط ع السداد', '"ع السداد" with no months-left context'],
    [
      'معاه ضريبة الاستيراد زي كل الاجهزة، بس للأسف الخط لسه متفعلتش من الشركة',
      'line not activated, but in a different clause from the tax word',
    ],
  ])('unknown: %s (%s)', (text) => {
    expect(readTaxStatus(text)).toBe('unknown');
  });

  it('lets an explicit "owed" win when an ad quotes both prices', () => {
    expect(readTaxStatus('سعره عليه ضريبه 43 سعره خالص ضريبه 60')).toBe('owed');
  });

  it('reads an exempt phone that just isn\'t activated yet as clear', () => {
    expect(readTaxStatus('معفي ضريبه لسه متفعلتش')).toBe('clear');
  });

  it('does not count a paid tax amount as owed', () => {
    expect(readTaxStatus('دفعت ضريبه ١٨ الف ومعاه الفاتوره')).toBe('clear');
  });

  it('treats a missing description as unknown', () => {
    expect(readTaxStatus(null)).toBe('unknown');
  });
});

describe('readBatteryHealth', () => {
  it.each([
    ['Battery Health: 93%', 93],
    ['بطارية ٩٨٪؜', 98],
    ['بطاريه ١٠٠ مشحون ٣٤ مره', 100], // not the charge count after it
    ['مشحون ٢٢٠ بطارية ٩٨٪', 98], // nor the one before it
    ['Iphone 17 Bt:100%', 100],
    ['iPhone 17 100 B 256 G Box', 100],
    ['17 256g B 98% عليه ضريبه', 98],
    ['256 100% battery With box', 100],
    ['battery 100 percent cycle count 150', 100],
    ['خلصان ضريبة بطارية. 96 256', 96],
    ['بطاريه %100 مشحون 100', 100],
    ['صحة البطارية: 95% (استخدام خفيف)', 95],
    ['حالة البطارية ٩٤', 94],
    ['بطاريه 100*100 مشحون 89مره', 100],
  ])('reads "%s" as %i%% (explicit)', (text, percent) => {
    expect(readBatteryHealth(text)).toEqual({ percent, confidence: 'explicit' });
  });

  it('prefers the first explicit mention (the spec line) over later sales talk', () => {
    expect(readBatteryHealth('البطارية: 94% (زي الجديد) • بطارية 100% أداء ممتاز')?.percent).toBe(94);
  });

  it('ignores a storage size or model number next to the battery keyword', () => {
    expect(readBatteryHealth('iPhone 17 B 100% معاه بوكس')?.percent).toBe(100);
    expect(readBatteryHealth('بطاريه 5000 مللي')).toBeNull();
  });

  it('infers a bare percentage, but marks it as inferred', () => {
    expect(readBatteryHealth('IPhone 17 كسر زيرو 256GB معفي ضريبه 98% قطعه مميزه')).toEqual({
      percent: 98,
      confidence: 'inferred',
    });
  });

  it('returns null when the ad says nothing about the battery', () => {
    expect(readBatteryHealth('iPhone 17 256 70 شحنة شرق اوسط')).toBeNull();
    expect(readBatteryHealth(null)).toBeNull();
  });
});
