import React from 'react';

const BookmarkNav = ({
    currentIndex,
    totalCount,
    onNewer,
    onOlder,
    onRegenerate,
    newerDisabled = false,
    olderDisabled = false,
    regenerateDisabled = false,
}) => {
    if (!totalCount || totalCount <= 0) return null;

    const atFirst = currentIndex <= 0;
    const atLast = currentIndex >= totalCount - 1;

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-3">
            <button
                onClick={onNewer}
                disabled={newerDisabled || atFirst}
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-md px-4 py-2 border border-transparent text-sm font-medium text-white transition-all duration-200 bg-blue-600 hover:bg-blue-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:bg-blue-400 disabled:dark:bg-blue-900/50 disabled:opacity-70 disabled:cursor-not-allowed"
            >
                &lt; Newer
            </button>

            <div className="flex items-center gap-4">
                <button
                    onClick={onRegenerate}
                    disabled={regenerateDisabled}
                    className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Regenerate Proposals
                </button>
                <span className="text-sm font-medium text-gray-500 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full whitespace-nowrap">
                    {currentIndex + 1} of {totalCount}
                </span>
            </div>

            <button
                onClick={onOlder}
                disabled={olderDisabled || atLast}
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-md px-4 py-2 border border-transparent text-sm font-medium text-white transition-all duration-200 bg-blue-600 hover:bg-blue-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:bg-blue-400 disabled:dark:bg-blue-900/50 disabled:opacity-70 disabled:cursor-not-allowed"
            >
                Older &gt;
            </button>
        </div>
    );
};

export default BookmarkNav;
