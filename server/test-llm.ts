import { geminiMatchRows } from './reconcile';

// Example transactions
const fileA = {
  "Date": "02/01/2024",
  "Type": "Invoice",
  "No.": "KAI-0026",
  "Customer": "Koin",
  "Memo": "",
  "Amount": "1,000.00",
  "__EMPTY": ""
};

const fileB = {
  "Date": "01/29/2024",
  "Bank ID": "",
  "Account Number": "",
  "Account Title": "Analysis Checking",
  "Account Owner": "KAI",
  "Record Type": "T",
  "Tran Type": "WIRE TRANSFER CREDIT",
  "BAI Type Code": "195",
  "Currency": "INR",
  "Credit Amount": "1,000.00",
  "Debit Amount": "",
  "Bank Ref #": "446",
  "End to End ID": "",
  "Customer Ref #": "20240129L1B77D1C000190",
  "Description": "WIRE IN   240129B6B7HU3R001624 202402900193;ORG Koin;OBI KAI-0020 /2",
  "Opening Ledger Balance": "",
  "Opening Available Balance": "",
  "1 - Day Float": "",
  "2 or More Days Float": "",
  "Closing Ledger Balance": "",
  "Closing Available Balance": "",
  "Reason for Payment": "KOSH-0020 /2495 ",
  "Notes": ""
};

(async () => {
  const result = await geminiMatchRows(fileA, fileB);
  console.log('LLM Response:', result);
})(); 