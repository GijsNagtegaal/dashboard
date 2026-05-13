import { Octokit } from '@octokit/rest';

const octokit = new Octokit({
    auth: process.env.GITHUB_PERSONAL_TOKEN,
});

export const getGitHubStats = async () => {
    try {
        const username = process.env.GITHUB_USERNAME;

        // Fetch repositories (single call)
        const reposResponse = await octokit.repos.listForUser({
            username,
            per_page: 100,
            sort: 'updated',
        });

        const repos = reposResponse.data;
        const repoCount = repos.length;

        // Get recent repos with activity
        const recentRepos = repos.slice(0, 5).map(repo => ({
            name: repo.name,
            url: repo.html_url,
            description: repo.description || 'No description',
            stars: repo.stargazers_count,
            language: repo.language || 'N/A',
            updatedAt: new Date(repo.updated_at).toLocaleDateString(),
        }));

        // Search for open issues across all user repos (single call)
        const issuesResponse = await octokit.search.issuesAndPullRequests({
            q: `is:open is:issue user:${username}`,
            per_page: 1,
        });

        // Search for open PRs (single call)
        const prsResponse = await octokit.search.issuesAndPullRequests({
            q: `is:open is:pr user:${username}`,
            per_page: 1,
        });

        return {
            repoCount,
            totalIssues: issuesResponse.data.total_count,
            totalPRs: prsResponse.data.total_count,
            recentRepos,
            userName: username,
        };
    } catch (error) {
        console.error('GitHub API error:', error.message);
        return {
            repoCount: 0,
            totalIssues: 0,
            totalPRs: 0,
            recentRepos: [],
            userName: process.env.GITHUB_USERNAME,
        };
    }
};

export default {
    getGitHubStats,
};
