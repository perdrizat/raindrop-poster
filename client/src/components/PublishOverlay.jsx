import React from 'react';

const PublishOverlay = ({ type, message, url, partialErrors, tagWarning, onDismiss, onNext }) => {
    const isError = type === 'error';
    const baseColors = isError
        ? 'bg-red-100 text-red-800 border-red-500 dark:bg-red-900/30 dark:text-red-300'
        : 'bg-green-100 text-green-800 border-green-500 dark:bg-green-900/30 dark:text-green-300';

    return (
        <div
            role="status"
            className={`fixed top-4 right-4 p-4 rounded-md shadow-lg font-medium z-50 transition-all border-l-4 max-w-sm ${baseColors}`}
        >
            <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                    <p className="font-semibold">
                        {isError ? '⚠ ' : '✓ '}{message}
                    </p>

                    {url && (
                        <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block mt-1 text-sm underline hover:no-underline"
                        >
                            View on Buffer
                        </a>
                    )}

                    {partialErrors && partialErrors.length > 0 && (
                        <div className="mt-2 p-2 rounded bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 text-xs">
                            <p className="font-semibold mb-1">Some channels failed:</p>
                            <ul className="list-disc list-inside">
                                {partialErrors.map((err, i) => <li key={i}>{err}</li>)}
                            </ul>
                        </div>
                    )}

                    {tagWarning && (
                        <p className="mt-2 text-xs text-yellow-700 dark:text-yellow-300">{tagWarning}</p>
                    )}
                </div>
            </div>

            <div className="mt-3 flex justify-end gap-2">
                <button
                    onClick={onDismiss}
                    className="text-xs font-medium px-3 py-1 rounded-md border border-current hover:bg-white/50 dark:hover:bg-black/20 transition-colors"
                >
                    Dismiss
                </button>
                {onNext && (
                    <button
                        onClick={onNext}
                        className="text-xs font-medium px-3 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                        Next Post
                    </button>
                )}
            </div>
        </div>
    );
};

export default PublishOverlay;
