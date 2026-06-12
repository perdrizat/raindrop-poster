import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProviderButton from './ProviderButton';

describe('ProviderButton', () => {
    it('renders login state and fires onConnect with the provider id', async () => {
        const onConnect = vi.fn();
        render(<ProviderButton providerName="Raindrop.io" providerId="raindropio" isConnected={false} onConnect={onConnect} />);

        const loginBtn = screen.getByRole('button', { name: /log in with raindrop\.io/i });
        await userEvent.click(loginBtn);
        expect(onConnect).toHaveBeenCalledWith('raindropio');
    });

    it('renders connected state with a disabled main button that does not fire onConnect', async () => {
        const onConnect = vi.fn();
        render(<ProviderButton providerName="Buffer.com" providerId="buffer" isConnected={true} onConnect={onConnect} />);

        const btn = screen.getByRole('button', { name: /connected to buffer\.com/i });
        expect(btn).toBeDisabled();
        await userEvent.click(btn);
        expect(onConnect).not.toHaveBeenCalled();
    });

    it('shows Test Connection only when connected and onTest is provided, firing with provider id', async () => {
        const onTest = vi.fn();
        const { rerender } = render(
            <ProviderButton providerName="Venice.ai" providerId="venice" isConnected={false} onConnect={() => { }} onTest={onTest} />
        );
        expect(screen.queryByRole('button', { name: /test connection/i })).not.toBeInTheDocument();

        rerender(<ProviderButton providerName="Venice.ai" providerId="venice" isConnected={true} onConnect={() => { }} onTest={onTest} />);
        await userEvent.click(screen.getByRole('button', { name: /test connection/i }));
        expect(onTest).toHaveBeenCalledWith('venice');
    });

    it('hides Test Connection when onTest is not provided even if connected', () => {
        render(<ProviderButton providerName="X" providerId="x" isConnected={true} onConnect={() => { }} />);
        expect(screen.queryByRole('button', { name: /test connection/i })).not.toBeInTheDocument();
    });
});
