# Career Opportunity Tracker

A web application that scrapes career pages from companies and exports job opportunities to an Excel file. The application allows you to add multiple career sites, refresh job listings, and automatically update the Excel export.

## Features

- 🌐 **Web Interface**: Easy-to-use web interface to manage tracked career sites
- 🔍 **Automatic Scraping**: Scrapes job listings from career pages using Puppeteer
- 📊 **Excel Export**: Exports all job opportunities to a structured Excel file
- 🔄 **Auto-Refresh**: Automatically updates the Excel file when jobs are refreshed
- ➕ **Add Sites**: Add new career sites through the web interface
- 📈 **Multiple Sheets**: Excel file includes summary, all jobs, and individual company sheets

## Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

   For development with auto-reload:
   ```bash
   npm run dev
   ```

3. **Open your browser:**
   Navigate to `http://localhost:3000`

## Usage

1. **Add a Career Site:**
   - Enter the career site URL (e.g., `https://careers.company.com`)
   - Optionally enter a company name
   - Click "Add Site"

2. **Refresh Jobs:**
   - Click "Refresh Now" on a specific site to scrape its job listings
   - Or click "Refresh All" to refresh all tracked sites at once
   - The Excel file is automatically updated after each refresh

3. **View Jobs:**
   - Click "View Jobs" to see all scraped jobs for a specific company

4. **Export to Excel:**
   - Click "Export to Excel" to download the current job opportunities
   - The Excel file includes:
     - Summary sheet with company statistics
     - All Jobs sheet with complete job listings
     - Individual sheets for each company

## File Structure

- `server.js` - Express backend server with scraping and Excel export logic
- `public/index.html` - Frontend web interface
- `data/` - Directory containing:
  - `tracked_sites.json` - List of tracked career sites
  - `jobs.json` - All scraped job opportunities
  - `job_opportunities.xlsx` - Excel export file (auto-generated)

## How It Works

1. **Scraping**: Uses Puppeteer to visit career pages and extract job listings
2. **Storage**: Stores tracked sites and jobs in JSON files
3. **Excel Export**: Uses the `xlsx` library to create structured Excel files
4. **Auto-Refresh**: Excel file is automatically updated when jobs are refreshed

## Notes

- The scraper attempts to find job listings using common HTML patterns
- Some career sites may require manual review if automatic extraction fails
- The Excel file is saved in the `data/` directory and can be downloaded via the web interface
- If the Excel file already exists, it will be refreshed/updated with new data

## Dependencies

- `express` - Web server framework
- `puppeteer` - Headless browser for web scraping
- `xlsx` - Excel file generation
- `cors` - Cross-origin resource sharing

## Troubleshooting

- **Scraping fails**: Some sites may have anti-scraping measures. Try refreshing or check the site manually.
- **No jobs found**: The scraper uses common patterns. Some sites may need custom selectors.
- **Server won't start**: Make sure port 3000 is available or set a different PORT environment variable.

