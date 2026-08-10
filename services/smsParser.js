/**
 * Smart Bank SMS Parser Engine
 * Supports Sri Lankan & International Banks: Commercial Bank, BOC, Sampath, HNB, Seylan, NTB, eZ Cash, mCash, etc.
 */

const parseBankSms = (smsText) => {
  if (!smsText || typeof smsText !== 'string') {
    return null;
  }

  const cleanText = smsText.trim();
  const lowerText = cleanText.toLowerCase();

  // 1. Extract Amount (e.g. LKR 4,500.00, Rs. 1500, USD 45.00, EUR 120, 2500 LKR, 4500.00 LKR)
  let amount = 0;
  const amountPatterns = [
    /(?:LKR|RS\.?|USD|EUR|GBP|\$|€|£)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:LKR|RS\.?|USD|EUR|GBP)/i,
    /amt:?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /amount:?\s*([\d,]+(?:\.\d{1,2})?)/i
  ];

  for (const pattern of amountPatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      const rawNum = (match[1] || match[2]).replace(/,/g, '');
      const parsedVal = parseFloat(rawNum);
      if (!isNaN(parsedVal) && parsedVal > 0) {
        amount = parsedVal;
        break;
      }
    }
  }

  if (!amount || isNaN(amount)) {
    return null; // Unable to find valid transaction amount
  }

  // 2. Determine Transaction Type (add = income/credit, deduct = expense/debit)
  let type = 'deduct';
  const creditKeywords = [
    'credited', 'received', 'deposit', 'added', 'salary', 'refund', 'cashback', 
    'credit to', 'received from', 'transfer in', 'topup success'
  ];

  if (creditKeywords.some(kw => lowerText.includes(kw))) {
    type = 'add';
  }

  // 3. Extract Bank Name / Provider
  let bank = 'Bank Transaction';
  if (lowerText.includes('combank') || lowerText.includes('commercial bank')) {
    bank = 'Commercial Bank of Ceylon';
  } else if (lowerText.includes('boc') || lowerText.includes('bank of ceylon')) {
    bank = 'Bank of Ceylon (BOC)';
  } else if (lowerText.includes('sampath')) {
    bank = 'Sampath Bank';
  } else if (lowerText.includes('hnb') || lowerText.includes('hatton national')) {
    bank = 'Hatton National Bank (HNB)';
  } else if (lowerText.includes('seylan')) {
    bank = 'Seylan Bank';
  } else if (lowerText.includes('ntb') || lowerText.includes('nations trust')) {
    bank = 'Nations Trust Bank';
  } else if (lowerText.includes('ez cash') || lowerText.includes('ezcash')) {
    bank = 'eZ Cash';
  } else if (lowerText.includes('mcash')) {
    bank = 'mCash';
  } else if (lowerText.includes('koko')) {
    bank = 'Koko Pay';
  } else if (lowerText.includes('payhere')) {
    bank = 'PayHere';
  }

  // 4. Extract Merchant / Location / Beneficiary
  let merchant = bank;
  const merchantPatterns = [
    /(?:at|to|from|via|merchant:?)\s+([A-Za-z0-9\s&'.-]{2,30}?)(?:\.\s|\son\s|\sfor\s|\sat\s|\sRef|\sAvail|\sBal|\sA\/C|$)/i,
    /spent\s+at\s+([A-Za-z0-9\s&'.-]{2,30}?)(?:\.\s|\son\s|\sRef|$)/i,
    /paid\s+to\s+([A-Za-z0-9\s&'.-]{2,30}?)(?:\.\s|\son\s|\sRef|$)/i
  ];

  for (const pattern of merchantPatterns) {
    const mMatch = cleanText.match(pattern);
    if (mMatch && mMatch[1]) {
      const extracted = mMatch[1].trim();
      if (extracted.length > 2 && !['lkr', 'rs', 'usd', 'bank', 'account', 'card'].includes(extracted.toLowerCase())) {
        merchant = extracted;
        break;
      }
    }
  }

  // 5. Predict Smart Category based on keywords
  let category = 'General';
  const combo = (merchant + ' ' + cleanText).toLowerCase();

  if (combo.includes('food') || combo.includes('cargills') || combo.includes('keells') || combo.includes('arpico') || combo.includes('supermarket') || combo.includes('restaurant') || combo.includes('kfc') || combo.includes('pizza') || combo.includes('bakery')) {
    category = 'Food & Dining';
  } else if (combo.includes('fuel') || combo.includes('ceypetco') || combo.includes('ioc') || combo.includes('laufgs') || combo.includes('petrol') || combo.includes('uber') || combo.includes('pickme') || combo.includes('cab') || combo.includes('transport')) {
    category = 'Transport';
  } else if (combo.includes('ceb') || combo.includes('water') || combo.includes('slt') || combo.includes('dialog') || combo.includes('mobitel') || combo.includes('hutch') || combo.includes('electricity') || combo.includes('bill')) {
    category = 'Bills & Utilities';
  } else if (combo.includes('daraz') || combo.includes('fashion') || combo.includes('cloth') || combo.includes('nolimit') || combo.includes('odel') || combo.includes('store') || combo.includes('amazon') || combo.includes('shopping')) {
    category = 'Shopping';
  } else if (combo.includes('hospital') || combo.includes('pharmacy') || combo.includes('medical') || combo.includes('clinic') || combo.includes('doctor') || combo.includes('lanka hospitals') || combo.includes('asiri')) {
    category = 'Healthcare';
  } else if (combo.includes('cinema') || combo.includes('movie') || combo.includes('netflix') || combo.includes('spotify') || combo.includes('game') || combo.includes('tickets')) {
    category = 'Entertainment';
  } else if (type === 'add') {
    category = 'Salary / Income';
  }

  // 6. Extract Date (e.g., 10-AUG-2026, 2026/08/10, 10/08/2026) or fallback to Today
  let date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const dateMatch = cleanText.match(/(\d{4}[-/.]\d{2}[-/.]\d{2})|(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})|(\d{1,2}[-/\s][A-Za-z]{3}[-/\s]\d{2,4})/);
  if (dateMatch) {
    try {
      const parsedDate = new Date(dateMatch[0]);
      if (!isNaN(parsedDate.getTime())) {
        date = parsedDate.toISOString().split('T')[0];
      }
    } catch (e) {
      // Keep today's date on parse error
    }
  }

  return {
    amount,
    type,
    bank,
    merchant,
    category,
    date,
    description: `[SMS Auto] ${merchant}`,
    rawSms: cleanText
  };
};

module.exports = {
  parseBankSms
};
