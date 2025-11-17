const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const XLSX = require('xlsx');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const DATA_DIR = path.join(__dirname, 'data');
const SITES_FILE = path.join(DATA_DIR, 'tracked_sites.json');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
const EXCEL_FILE = path.join(DATA_DIR, 'job_opportunities.xlsx');

// Ensure data directory exists
async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (error) {
        console.error('Error creating data directory:', error);
    }
}

// Initialize data files if they don't exist
async function initializeData() {
    await ensureDataDir();
    
    try {
        await fs.access(SITES_FILE);
    } catch {
        await fs.writeFile(SITES_FILE, JSON.stringify([], null, 2));
    }
    
    try {
        await fs.access(JOBS_FILE);
    } catch {
        await fs.writeFile(JOBS_FILE, JSON.stringify([], null, 2));
    }
}

// Read tracked sites
async function readTrackedSites() {
    try {
        const data = await fs.readFile(SITES_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

// Write tracked sites
async function writeTrackedSites(sites) {
    await fs.writeFile(SITES_FILE, JSON.stringify(sites, null, 2));
}

// Read jobs
async function readJobs() {
    try {
        const data = await fs.readFile(JOBS_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

// Write jobs
async function writeJobs(jobs) {
    await fs.writeFile(JOBS_FILE, JSON.stringify(jobs, null, 2));
}

// Scrape career page
async function scrapeCareerPage(url) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        
        // Navigate to the page
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Wait a bit for dynamic content
        await page.waitForTimeout(2000);
        
        // Try multiple selectors for job listings
        const jobs = await page.evaluate(() => {
            const jobElements = [];
            
            // Common selectors for job listings
            const selectors = [
                'a[href*="job"]',
                'a[href*="career"]',
                'a[href*="position"]',
                '[class*="job"]',
                '[class*="position"]',
                '[class*="opening"]',
                '[id*="job"]',
                '[data-job-id]',
                'article',
                '.job-listing',
                '.job-item',
                '.position',
                '.opening'
            ];
            
            // Try to find job containers
            let foundElements = [];
            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    foundElements = Array.from(elements);
                    break;
                }
            }
            
            // Extract job information
            foundElements.forEach((element, index) => {
                if (index > 20) return; // Limit to 20 jobs per page
                
                const text = element.textContent?.trim() || '';
                const href = element.href || element.querySelector('a')?.href || '';
                
                // Filter out non-job related content
                if (text.length > 10 && text.length < 200) {
                    // Try to extract title
                    const titleElement = element.querySelector('h1, h2, h3, h4, .title, [class*="title"]') || element;
                    const title = titleElement.textContent?.trim() || text.substring(0, 50);
                    
                    // Try to extract location
                    const locationElement = element.querySelector('[class*="location"], [class*="city"], .location');
                    const location = locationElement?.textContent?.trim() || 'Not specified';
                    
                    // Try to extract description
                    const descElement = element.querySelector('[class*="description"], [class*="summary"], p');
                    const summary = descElement?.textContent?.trim() || text.substring(0, 150);
                    
                    if (title && title.length > 3) {
                        jobElements.push({
                            title: title.substring(0, 100),
                            location: location.substring(0, 100),
                            summary: summary.substring(0, 300),
                            url: href || url
                        });
                    }
                }
            });
            
            // If no jobs found with selectors, try to find any links that might be jobs
            if (jobElements.length === 0) {
                const allLinks = document.querySelectorAll('a[href]');
                allLinks.forEach((link, index) => {
                    if (index > 15) return;
                    const linkText = link.textContent?.trim() || '';
                    const linkHref = link.href || '';
                    
                    if (linkText.length > 10 && linkText.length < 100 && 
                        (linkHref.includes('job') || linkHref.includes('career') || linkHref.includes('position'))) {
                        jobElements.push({
                            title: linkText.substring(0, 100),
                            location: 'Not specified',
                            summary: linkText.substring(0, 300),
                            url: linkHref
                        });
                    }
                });
            }
            
            return jobElements.slice(0, 20); // Limit to 20 jobs
        });
        
        return jobs.length > 0 ? jobs : [{
            title: 'No jobs found - Manual review needed',
            location: 'N/A',
            summary: `Could not automatically extract jobs from ${url}. Please review the page manually.`,
            url: url
        }];
        
    } catch (error) {
        console.error(`Error scraping ${url}:`, error.message);
        return [{
            title: 'Scraping Error',
            location: 'N/A',
            summary: `Error: ${error.message}`,
            url: url
        }];
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Export to Excel
async function exportToExcel() {
    const jobs = await readJobs();
    
    if (jobs.length === 0) {
        return { success: false, message: 'No jobs to export' };
    }
    
    // Group jobs by company
    const jobsByCompany = {};
    jobs.forEach(job => {
        if (!jobsByCompany[job.companyName]) {
            jobsByCompany[job.companyName] = [];
        }
        jobsByCompany[job.companyName].push(job);
    });
    
    // Create workbook
    const workbook = XLSX.utils.book_new();
    
    // Create summary sheet
    const summaryData = [['Company', 'Total Jobs', 'Last Updated']];
    Object.keys(jobsByCompany).forEach(company => {
        const companyJobs = jobsByCompany[company];
        const lastUpdated = companyJobs[0]?.fetchedAt || 'N/A';
        summaryData.push([company, companyJobs.length, lastUpdated]);
    });
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
    
    // Create detailed jobs sheet
    const jobsData = [['Company', 'Title', 'Location', 'Summary', 'URL', 'Fetched At']];
    jobs.forEach(job => {
        jobsData.push([
            job.companyName || 'Unknown',
            job.title || 'N/A',
            job.location || 'N/A',
            job.summary || 'N/A',
            job.url || 'N/A',
            job.fetchedAt || 'N/A'
        ]);
    });
    const jobsSheet = XLSX.utils.aoa_to_sheet(jobsData);
    XLSX.utils.book_append_sheet(workbook, jobsSheet, 'All Jobs');
    
    // Create sheet for each company
    Object.keys(jobsByCompany).forEach(company => {
        const companyJobs = jobsByCompany[company];
        const companyData = [['Title', 'Location', 'Summary', 'URL', 'Fetched At']];
        companyJobs.forEach(job => {
            companyData.push([
                job.title || 'N/A',
                job.location || 'N/A',
                job.summary || 'N/A',
                job.url || 'N/A',
                job.fetchedAt || 'N/A'
            ]);
        });
        const companySheet = XLSX.utils.aoa_to_sheet(companyData);
        // Excel sheet names are limited to 31 characters
        const sheetName = company.substring(0, 31);
        XLSX.utils.book_append_sheet(workbook, companySheet, sheetName);
    });
    
    // Write file
    XLSX.writeFile(workbook, EXCEL_FILE);
    
    return { success: true, message: `Exported ${jobs.length} jobs to Excel`, file: EXCEL_FILE };
}

// API Routes

// Get all tracked sites
app.get('/api/sites', async (req, res) => {
    try {
        const sites = await readTrackedSites();
        res.json(sites);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add a new tracked site
app.post('/api/sites', async (req, res) => {
    try {
        const { url, companyName } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }
        
        const sites = await readTrackedSites();
        const newSite = {
            id: Date.now().toString(),
            url: url,
            companyName: companyName || url,
            createdAt: new Date().toISOString(),
            lastRefreshed: null,
            jobCount: 0
        };
        
        sites.push(newSite);
        await writeTrackedSites(sites);
        
        res.json(newSite);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete a tracked site
app.delete('/api/sites/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const sites = await readTrackedSites();
        const filteredSites = sites.filter(site => site.id !== id);
        await writeTrackedSites(filteredSites);
        
        // Also delete associated jobs
        const jobs = await readJobs();
        const filteredJobs = jobs.filter(job => job.siteId !== id);
        await writeJobs(filteredJobs);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Refresh jobs for a specific site
app.post('/api/sites/:id/refresh', async (req, res) => {
    try {
        const { id } = req.params;
        const sites = await readTrackedSites();
        const site = sites.find(s => s.id === id);
        
        if (!site) {
            return res.status(404).json({ error: 'Site not found' });
        }
        
        // Scrape the career page
        const jobs = await scrapeCareerPage(site.url);
        
        // Remove old jobs for this site
        const allJobs = await readJobs();
        const filteredJobs = allJobs.filter(job => job.siteId !== id);
        
        // Add new jobs
        const newJobs = jobs.map(job => ({
            ...job,
            siteId: id,
            companyName: site.companyName || site.url,
            fetchedAt: new Date().toISOString()
        }));
        
        filteredJobs.push(...newJobs);
        await writeJobs(filteredJobs);
        
        // Update site metadata
        site.lastRefreshed = new Date().toISOString();
        site.jobCount = jobs.length;
        await writeTrackedSites(sites);
        
        // Export to Excel
        await exportToExcel();
        
        res.json({ 
            success: true, 
            jobs: newJobs,
            jobCount: jobs.length 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Refresh all sites
app.post('/api/sites/refresh/all', async (req, res) => {
    try {
        const sites = await readTrackedSites();
        const results = [];
        
        for (const site of sites) {
            try {
                const jobs = await scrapeCareerPage(site.url);
                
                // Remove old jobs for this site
                const allJobs = await readJobs();
                const filteredJobs = allJobs.filter(job => job.siteId !== site.id);
                
                // Add new jobs
                const newJobs = jobs.map(job => ({
                    ...job,
                    siteId: site.id,
                    companyName: site.companyName || site.url,
                    fetchedAt: new Date().toISOString()
                }));
                
                filteredJobs.push(...newJobs);
                await writeJobs(filteredJobs);
                
                // Update site metadata
                site.lastRefreshed = new Date().toISOString();
                site.jobCount = jobs.length;
                
                results.push({ site: site.companyName || site.url, jobCount: jobs.length });
            } catch (error) {
                results.push({ site: site.companyName || site.url, error: error.message });
            }
        }
        
        await writeTrackedSites(sites);
        await exportToExcel();
        
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get jobs for a specific site
app.get('/api/sites/:id/jobs', async (req, res) => {
    try {
        const { id } = req.params;
        const jobs = await readJobs();
        const siteJobs = jobs.filter(job => job.siteId === id);
        res.json(siteJobs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Export to Excel
app.get('/api/export/excel', async (req, res) => {
    try {
        const result = await exportToExcel();
        if (result.success) {
            res.download(EXCEL_FILE, 'job_opportunities.xlsx', (err) => {
                if (err) {
                    res.status(500).json({ error: 'Error downloading file' });
                }
            });
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
async function startServer() {
    await initializeData();
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Excel file will be saved to: ${EXCEL_FILE}`);
    });
}

startServer().catch(console.error);

