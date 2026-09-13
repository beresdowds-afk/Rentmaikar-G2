import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CallCenterSubPageErrorBoundary } from '../CallCenterSubPageErrorBoundary';
import { VALID_CALL_CENTER_SUBTABS } from '../CallCenterPage';
import { VoiceHealthDashboard } from '../VoiceHealthDashboard';
import { WhatsAppVoiceConsole } from '../WhatsAppVoiceConsole';

// Radix UI Slider requires ResizeObserver in DOM environment
beforeEach(() => {
  if (typeof window !== 'undefined' && !window.ResizeObserver) {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

describe('CallCenter Sibling Isolation & Error Boundaries', () => {
  it('defines all 11 isolated subtabs without gaps', () => {
    expect(VALID_CALL_CENTER_SUBTABS).toEqual([
      'dialer',
      'whatsapp-voice',
      'ivr',
      'numbers',
      'extensions',
      'telecom-health',
      'queue',
      'history',
      'recordings',
      'conferences',
      'settings',
    ]);
  });

  it('renders children cleanly inside CallCenterSubPageErrorBoundary', () => {
    render(
      <CallCenterSubPageErrorBoundary subPage="Test SubPage">
        <div data-testid="healthy-subpage">Healthy SubPage Content</div>
      </CallCenterSubPageErrorBoundary>
    );

    expect(screen.getByTestId('healthy-subpage')).toBeInTheDocument();
    expect(screen.queryByText(/Temporarily Unavailable/i)).not.toBeInTheDocument();
  });

  it('isolates sub-page crashes and provides retry and return-to-dialer actions', async () => {
    const user = userEvent.setup();
    const handleResetToDialer = vi.fn();

    // Component that deliberately throws
    const ThrowingComponent = () => {
      throw new Error('Simulated VoIP codec hardware crash');
    };

    // Suppress console.error in test output for caught boundary error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <CallCenterSubPageErrorBoundary
        subPage="Visual IVR Flow Builder"
        onResetToDialer={handleResetToDialer}
      >
        <ThrowingComponent />
      </CallCenterSubPageErrorBoundary>
    );

    // Sibling fault card is displayed
    expect(screen.getByText(/Visual IVR Flow Builder Temporarily Unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/Isolated Sub-Page Fault/i)).toBeInTheDocument();
    expect(screen.getByText(/Simulated VoIP codec hardware crash/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry Visual IVR Flow Builder/i })).toBeInTheDocument();

    const returnBtn = screen.getByRole('button', { name: /Return to Softphone Dialer/i });
    expect(returnBtn).toBeInTheDocument();

    await user.click(returnBtn);
    expect(handleResetToDialer).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });

  it('renders VoiceHealthDashboard safely even if voice prop is missing or partial', () => {
    // Regression test: Previously <VoiceHealthDashboard /> was invoked with no props,
    // which threw a TypeError when destructuring voice.status and crashed the Call Center.
    render(<VoiceHealthDashboard />);

    expect(screen.getByText(/Telephony System Health/i)).toBeInTheDocument();
    expect(screen.getByText(/unregistered/i)).toBeInTheDocument();
  });

  it('renders WhatsAppVoiceConsole safely even if voice prop is missing', () => {
    render(<WhatsAppVoiceConsole />);

    expect(screen.getByText(/WhatsApp Voice Calling Console/i)).toBeInTheDocument();
    expect(screen.getByText(/Start Voice Call/i)).toBeInTheDocument();
  });
});
