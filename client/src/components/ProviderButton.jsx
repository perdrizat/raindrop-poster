import React from 'react';

const ProviderButton = ({ providerName, providerId, isConnected, onConnect, onTest }) => {
    return (
        <div className={`p-4 rounded-xl border transition-all duration-300 flex flex-col justify-between
            ${isConnected
                ? 'bg-blue-50/50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
                : 'bg-white border-gray-200 dark:bg-black dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
            }`}
        >
            <button
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-colors
                    ${isConnected
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-800/40 dark:text-blue-300 cursor-default'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-800'
                    }`}
                onClick={() => !isConnected && onConnect(providerId)}
                disabled={isConnected}
            >
                <div className="flex items-center space-x-2">
                    <span className="truncate">
                        {isConnected ? `Connected to ${providerName}` : `Log in with ${providerName}`}
                    </span>
                </div>
                {isConnected && (
                    <svg className="w-5 h-5 text-blue-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )}
            </button>

            {isConnected && onTest && (
                <div className="mt-3">
                    <button
                        className="w-full text-xs font-semibold py-2 rounded-md text-gray-600 bg-gray-100 hover:bg-gray-200 dark:text-gray-400 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
                        onClick={() => onTest(providerId)}
                        title={`Test API Connection with ${providerName}`}
                    >
                        Test Connection
                    </button>
                </div>
            )}
        </div>
    );
};

export default ProviderButton;
